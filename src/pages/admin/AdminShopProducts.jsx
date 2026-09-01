import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Plus, PencilSimple, Trash, FloppyDisk, X, CircleNotch, Eye, EyeSlash,
  Upload, Image as ImageIcon, DotsSixVertical, BookOpen, Package, Download,
  CaretDown, CaretUp, Warning, Sparkle, HandCoins, Storefront,
  ImagesSquare, LinkSimple, Truck, Bell, Star,
} from '@phosphor-icons/react';
import {
  fetchAllShopProducts, saveShopProduct, deleteShopProduct,
  toggleProductActive, reorderProducts, PRODUCT_CATEGORIES, generateSlug,
  cloneSpecsTemplate,
} from '../../config/plannerProducts';
import { uploadShopProductImage, uploadShopDigitalFile, deleteImageFromStorage, compressImage } from '../../utils/storageUtils';
import { auth } from '../../config/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AdminBottomSheet } from '../../components/admin/adminUi';
import AdminShopWaitlist from './AdminShopWaitlist';
import AdminShopReviews from './AdminShopReviews';
import AdminMarketplaces from './AdminMarketplaces';

const PRODUCT_VIEWS = [
  { id: 'products', label: 'Products', icon: Package },
  { id: 'waitlist', label: 'Waitlist', icon: Bell },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'marketplaces', label: 'Marketplaces', icon: Storefront },
];

function resolveProductView(raw) {
  if (raw === 'waitlist' || raw === 'reviews' || raw === 'marketplaces') return raw;
  return 'products';
}

const CATEGORY_OPTIONS = Object.entries(PRODUCT_CATEGORIES).map(([value, label]) => ({ value, label }));
const SIZE_OPTIONS = [
  { value: '', label: 'None' },
  { value: '7x10', label: '7×10' },
  { value: '5x7', label: '5×7' },
];

const CATEGORY_ICONS = { planner: BookOpen, accessory: Package, digital: Download };

const EMPTY_FORM = {
  name: '',
  category: 'planner',
  size: '',
  price: '',
  stripePriceId: '',
  description: '',
  images: [],
  requiresShipping: true,
  active: true,
  sortOrder: 0,
  stock: '',
  sku: '',
  slug: '',
  platformIds: { etsy: '', tiktok: '' },
  relatedProductIds: [],
  restockThreshold: 5,
  specs: [],
  downloadStoragePath: '',
  downloadFileName: '',
};

function toast(type, message) {
  window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { type, message } }));
}

function FormSectionHeader({ icon: Icon, title, subtitle, theme }) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <Icon size={32} style={{ color: theme.primary }} />
      <div className="flex flex-col gap-0.5">
        <h4 className="text-lg font-black tracking-wide" style={{ color: theme.text }}>{title}</h4>
        <div className="flex items-center gap-2 ml-1">
          <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
            {subtitle}
          </span>
        </div>
      </div>
    </div>
  );
}

function fieldStyle(theme) {
  return {
    borderColor: theme.border,
    backgroundColor: theme.cardBackground,
    color: theme.text,
    boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)',
  };
}

const FIELD_CLS = 'w-full px-3 py-2.5 rounded-lg border text-sm outline-none';

function PillToggle({ options, value, onChange, theme, className = '' }) {
  return (
    <div
      className={`flex rounded-lg p-1 gap-1 ${className}`}
      style={{ backgroundColor: theme.isDark ? `${theme.primary}18` : `${theme.primary}12`, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)' }}
    >
      {options.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className="flex-1 px-2 py-2 text-xs sm:text-sm font-medium rounded-md transition-all text-center active:scale-95 whitespace-nowrap"
          style={{
            backgroundColor: value === v ? '#445952' : 'transparent',
            color: value === v ? '#fff' : theme.textLight,
            boxShadow: value === v ? 'inset 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function FieldHint({ children, theme }) {
  return (
    <p className="text-[11px] mt-1.5 opacity-60" style={{ color: theme.textLight }}>
      {children}
    </p>
  );
}

export default function AdminShopProducts() {
  const { theme } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolveProductView(searchParams.get('view'));
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfInputRef = useRef(null);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const dragImgFrom = useRef(null);
  const [dragImgOver, setDragImgOver] = useState(null);
  const [showRelated, setShowRelated] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const dragItem = useRef(null);
  const dragOver = useRef(null);
  const fileInputRef = useRef(null);
  const pendingSlotRef = useRef(null);

  const switchView = (next) => {
    setSearchParams(next === 'products' ? {} : { view: next }, { replace: true });
  };

  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await fetchAllShopProducts();
      setProducts(data);
    } catch (err) {
      console.error('Error loading products:', err);
      toast('error', 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const openCreateForm = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setConfirmDelete(false);
    setShowForm(true);
  };

  const openEditForm = (product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name || '',
      category: product.category || 'planner',
      size: product.size || '',
      price: product.price ?? '',
      stripePriceId: product.stripePriceId || '',
      description: product.description || '',
      images: Array.isArray(product.images) && product.images.length > 0
        ? product.images.map(img => typeof img === 'string' ? { url: img } : img).filter(Boolean)
        : [product.image, product.hoverImage]
            .filter(Boolean)
            .map(img => typeof img === 'string' ? { url: img } : img),
      requiresShipping: product.requiresShipping ?? true,
      active: product.active ?? true,
      sortOrder: product.sortOrder ?? 0,
      stock: product.stock ?? '',
      sku: product.sku || '',
      slug: product.slug || '',
      platformIds: {
        etsy: product.platformIds?.etsy || '',
        tiktok: product.platformIds?.tiktok || '',
      },
      relatedProductIds: Array.isArray(product.relatedProductIds) ? product.relatedProductIds : [],
      restockThreshold: product.restockThreshold ?? 5,
      specs: Array.isArray(product.specs) && product.specs.length > 0
        ? product.specs.map((s) => ({ label: s.label || '', value: s.value || '' }))
        : (product.category !== 'planner' ? cloneSpecsTemplate(product.category) : []),
      downloadStoragePath: product.downloadStoragePath || '',
      downloadFileName: product.downloadFileName || '',
    });
    setConfirmDelete(false);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setShowRelated(false);
    setConfirmDelete(false);
  };

  const handleCategoryChange = (cat) => {
    setFormData((prev) => {
      const next = {
        ...prev,
        category: cat,
        requiresShipping: cat !== 'digital',
        size: cat === 'planner' ? prev.size : '',
      };
      if (cat === 'planner') {
        next.specs = [];
      } else if (!prev.specs?.length || prev.category === 'planner') {
        next.specs = cloneSpecsTemplate(cat);
      }
      return next;
    });
  };

  const updateSpecRow = (idx, field, value) => {
    setFormData((prev) => {
      const specs = [...(prev.specs || [])];
      specs[idx] = { ...specs[idx], [field]: value };
      return { ...prev, specs };
    });
  };

  const addSpecRow = () => {
    setFormData((prev) => ({
      ...prev,
      specs: [...(prev.specs || []), { label: '', value: '' }],
    }));
  };

  const removeSpecRow = (idx) => {
    setFormData((prev) => ({
      ...prev,
      specs: (prev.specs || []).filter((_, i) => i !== idx),
    }));
  };

  const MAX_IMAGES = 10;

  const handleRemoveImageAtSlot = async (slotIdx) => {
    const img = formData.images?.[slotIdx];
    if (img?.path) {
      try { await deleteImageFromStorage(img.path); } catch {}
    }
    setFormData((prev) => {
      const imgs = [...(prev.images || [])];
      imgs.splice(slotIdx, 1);
      return { ...prev, images: imgs };
    });
  };

  const pickImageForSlot = (slotIdx) => {
    console.log('📸 pickImageForSlot called, slot:', slotIdx);
    pendingSlotRef.current = slotIdx;
    const input = fileInputRef.current;
    if (!input) { console.error('❌ fileInputRef is null'); return; }
    input.value = '';
    input.click();
    console.log('📸 file picker opened');
  };

  const onFileSelected = async (e) => {
    console.log('📸 onFileSelected fired, files:', e.target.files?.length);
    const file = e.target.files?.[0];
    if (!file) { console.log('📸 no file selected'); return; }
    const slotIdx = pendingSlotRef.current;
    console.log('📸 uploading to slot:', slotIdx, 'file:', file.name, file.size, file.type);
    if (slotIdx === null || slotIdx === undefined) return;

    if (!file.type.startsWith('image/')) { toast('error', 'File must be an image'); return; }
    if (!auth.currentUser) {
      console.error('❌ auth.currentUser is null — not logged in');
      toast('error', 'Not logged in — refresh and sign in again');
      return;
    }
    console.log('📸 auth OK:', auth.currentUser.email);

    setUploadingIdx(slotIdx);
    try {
      let uploadFile = file;
      if (file.size > 2 * 1024 * 1024) {
        console.log('📸 compressing image from', (file.size / 1024 / 1024).toFixed(1), 'MB');
        toast('info', 'Compressing image…');
        uploadFile = await compressImage(file, 1920, 0.85);
        console.log('📸 compressed to', (uploadFile.size / 1024 / 1024).toFixed(1), 'MB');
      }
      const result = await uploadShopProductImage(uploadFile, formData.name, slotIdx);
      console.log('✅ upload result:', result.url);
      setFormData((prev) => {
        const imgs = [...(prev.images || [])];
        imgs[slotIdx] = { url: result.url, path: result.path, alt: result.alt };
        return { ...prev, images: imgs };
      });
      toast('success', slotIdx === 0 ? 'Main image uploaded' : `Image ${slotIdx + 1} uploaded`);

      // Auto-write SEO description from the main image (slot 0) when field is empty
      if (slotIdx === 0 && !formData.description?.trim()) {
        await generateDescriptionFromImage(result.url, { silent: true });
      }
    } catch (err) {
      console.error('❌ Image upload error:', err);
      toast('error', `Upload failed: ${err?.message || 'unknown error'}`);
    } finally {
      setUploadingIdx(null);
    }
  };

  const generateDescriptionFromImage = async (imageUrl, { silent = false } = {}) => {
    if (!imageUrl || generatingDesc) return false;
    setGeneratingDesc(true);
    if (!silent) toast('info', 'Writing description from your image…');
    try {
      const fn = httpsCallable(getFunctions(), 'generateProductDescription');
      const { data } = await fn({
        imageUrl,
        productName: formData.name,
        size: formData.size,
        category: formData.category,
      });
      if (data?.description) {
        setFormData((prev) => ({ ...prev, description: data.description }));
        toast('success', 'Description generated from image');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Generate description error:', err);
      toast('error', `AI description failed: ${err?.message || 'unknown error'}`);
      return false;
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!auth.currentUser) {
      toast('error', 'Log in to admin before uploading PDFs');
      return;
    }
    setUploadingPdf(true);
    try {
      const result = await uploadShopDigitalFile(file, editingId || 'draft', formData.name);
      setFormData((prev) => ({
        ...prev,
        downloadStoragePath: result.path,
        downloadFileName: result.fileName,
      }));
      toast('success', 'PDF uploaded — customers get this file after purchase');
    } catch (err) {
      console.error('PDF upload error:', err);
      toast('error', err?.message || 'PDF upload failed');
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleGenerateDescription = async () => {
    const firstImg = formData.images?.[0];
    const imageUrl = firstImg?.url || (typeof firstImg === 'string' ? firstImg : null);
    if (!imageUrl) { toast('error', 'Upload at least one image first'); return; }
    await generateDescriptionFromImage(imageUrl);
  };

  const handleImgDragStart = (e, idx) => {
    dragImgFrom.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleImgDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragImgOver !== idx) setDragImgOver(idx);
  };

  const handleImgDrop = (e, toIdx) => {
    e.preventDefault();
    const fromIdx = dragImgFrom.current;
    if (fromIdx === null || fromIdx === toIdx) { setDragImgOver(null); return; }
    setFormData((prev) => {
      const imgs = [...(prev.images || [])];
      const [moved] = imgs.splice(fromIdx, 1);
      imgs.splice(toIdx, 0, moved);
      return { ...prev, images: imgs };
    });
    dragImgFrom.current = null;
    setDragImgOver(null);
  };

  const handleImgDragEnd = () => {
    dragImgFrom.current = null;
    setDragImgOver(null);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { toast('warning', 'Product name is required'); return; }
    if (!formData.stripePriceId.trim()) { toast('warning', 'Stripe Price ID is required'); return; }
    if (!formData.price || Number(formData.price) <= 0) { toast('warning', 'Price must be greater than 0'); return; }
    if (formData.category === 'digital' && !formData.downloadStoragePath) {
      toast('warning', 'Upload the PDF file for digital products before saving');
      return;
    }

    setIsSaving(true);
    try {
      console.log('🔐 Saving as:', auth.currentUser?.email, 'UID:', auth.currentUser?.uid);
      const data = {
        ...formData,
        price: Number(formData.price),
        sortOrder: editingId ? formData.sortOrder : products.length,
        slug: formData.slug.trim() || generateSlug(formData.name),
      };
      await saveShopProduct(data, editingId);
      toast('success', editingId ? 'Product updated!' : 'Product created!');
      closeForm();
      await loadProducts();
    } catch (err) {
      console.error('Save error:', err);
      console.error('Auth state:', auth.currentUser?.email, auth.currentUser?.uid);
      toast('error', 'Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      if (product.image?.path) {
        try { await deleteImageFromStorage(product.image.path); } catch {}
      }
      await deleteShopProduct(product.id);
      toast('success', 'Product deleted');
      await loadProducts();
    } catch (err) {
      toast('error', 'Failed to delete product');
    }
  };

  const handleDeleteFromForm = async () => {
    const product = products.find((p) => p.id === editingId);
    if (!product) return;
    setIsDeleting(true);
    try {
      if (product.image?.path) {
        try { await deleteImageFromStorage(product.image.path); } catch {}
      }
      await deleteShopProduct(product.id);
      toast('success', 'Product deleted');
      closeForm();
      await loadProducts();
    } catch (err) {
      toast('error', 'Failed to delete product');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleToggleActive = async (product) => {
    try {
      await toggleProductActive(product.id, product.active);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, active: !p.active } : p))
      );
      toast('success', product.active ? 'Product hidden from shop' : 'Product visible in shop');
    } catch (err) {
      toast('error', 'Failed to update product');
    }
  };

  const handleDragStart = (index) => { dragItem.current = index; };
  const handleDragEnter = (index) => { dragOver.current = index; };
  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return;
    const reordered = [...products];
    const [moved] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, moved);
    setProducts(reordered);
    dragItem.current = null;
    dragOver.current = null;
    try {
      await reorderProducts(reordered.map((p) => p.id));
      toast('success', 'Order saved');
    } catch { toast('error', 'Failed to save order'); }
  };

  const filtered = filterCategory === 'all' ? products : products.filter((p) => p.category === filterCategory);
  const isProducts = view === 'products';
  const isWaitlist = view === 'waitlist';
  const isReviews = view === 'reviews';
  const isMarketplaces = view === 'marketplaces';

  return (
    <div className="space-y-5 max-w-5xl min-w-0 w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileSelected}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}
        tabIndex={-1}
      />
      <div className="flex items-start gap-2 min-w-0">
        <div
          className="grid grid-cols-2 sm:flex flex-1 min-w-0 rounded-xl border p-1 gap-1"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#e8eaed',
          }}
          role="tablist"
          aria-label="Products view"
        >
          {PRODUCT_VIEWS.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchView(id)}
                className="sm:flex-1 flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors min-w-0"
                style={{
                  backgroundColor: active ? theme.primary : 'transparent',
                  color: active ? '#fff' : theme.text,
                }}
              >
                <Icon size={16} weight="duotone" className="shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
        {isProducts && (
          <button
            type="button"
            onClick={editingId ? handleSave : openCreateForm}
            disabled={editingId && isSaving}
            aria-label={editingId ? (isSaving ? 'Saving product' : 'Update product') : 'Add product'}
            title={editingId ? (isSaving ? 'Saving…' : 'Update product') : 'Add product'}
            className="flex items-center justify-center w-10 h-10 rounded-full text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 shadow-md shrink-0"
            style={{
              background: editingId && isSaving
                ? theme.secondary
                : `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark || theme.primary} 100%)`,
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
            }}
          >
            {editingId && isSaving ? (
              <CircleNotch size={20} className="animate-spin" />
            ) : editingId ? (
              <FloppyDisk size={20} weight="bold" />
            ) : (
              <Plus size={22} weight="bold" />
            )}
          </button>
        )}
      </div>

      {isWaitlist ? (
        <AdminShopWaitlist embedded theme={theme} />
      ) : isReviews ? (
        <AdminShopReviews embedded theme={theme} />
      ) : isMarketplaces ? (
        <AdminMarketplaces embedded theme={theme} />
      ) : (
      <>
      {/* Create / Edit Form */}
      <AdminBottomSheet
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Edit Product' : 'New Product'}
        theme={theme}
        wide
        footer={(
          <div className="flex items-center justify-between w-full gap-3">
            <div className="flex items-center flex-1 justify-start min-w-0">
              {editingId && (
                <>
                  <style>{`
                    @keyframes tapConfirmPop {
                      0%, 100% { transform: scale(1); }
                      50% { transform: scale(1.08); }
                    }
                    .tap-confirm-pop {
                      animation: tapConfirmPop 0.45s ease-out 2;
                    }
                  `}</style>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmDelete) {
                        handleDeleteFromForm();
                      } else {
                        setConfirmDelete(true);
                      }
                    }}
                    disabled={isDeleting || isSaving}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${confirmDelete ? 'tap-confirm-pop' : ''}`}
                    style={{ color: confirmDelete ? '#8B5335' : '#C67A5C' }}
                  >
                    <Trash size={15} weight={confirmDelete ? 'fill' : 'regular'} />
                    {isDeleting ? 'Deleting…' : confirmDelete ? 'Tap again to confirm' : 'Delete'}
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isDeleting}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              style={{
                background: isSaving ? theme.secondary : `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark || theme.primary} 100%)`,
                color: theme.textOnPrimary || '#ffffff',
                border: 'none',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              {isSaving ? (
                <span className="flex items-center gap-1.5"><CircleNotch size={14} className="animate-spin" /> Saving…</span>
              ) : (
                <span className="flex items-center gap-1.5"><FloppyDisk size={14} /> {editingId ? 'Update' : 'Create Product'}</span>
              )}
            </button>
          </div>
        )}
      >
        <div className="px-4 sm:px-5 space-y-6 pb-2">
          {/* Product Information */}
          <section>
            <FormSectionHeader icon={Package} title="Product Information" subtitle="Name & Category" theme={theme} />
            <div
              className="px-3 pt-3 pb-3 rounded-lg space-y-3"
              style={{
                border: theme.isDark ? 'none' : `1px solid ${theme.border}`,
                backgroundColor: theme.isDark ? '#1f2937' : '#f9fafb',
                boxShadow: theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Product name"
                className={FIELD_CLS}
                style={fieldStyle(theme)}
              />
              <div className={`grid gap-3 ${formData.category === 'planner' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                <PillToggle options={CATEGORY_OPTIONS} value={formData.category} onChange={handleCategoryChange} theme={theme} />
                {formData.category === 'planner' && (
                  <PillToggle
                    options={SIZE_OPTIONS}
                    value={formData.size}
                    onChange={(v) => setFormData({ ...formData, size: v })}
                    theme={theme}
                  />
                )}
              </div>
            </div>
          </section>

          {/* Pricing & Inventory */}
          <section>
            <FormSectionHeader icon={HandCoins} title="Pricing & Inventory" subtitle="Price & Stock" theme={theme} />
            <div
              className="px-3 pt-3 pb-3 rounded-lg space-y-3"
              style={{
                border: theme.isDark ? 'none' : `1px solid ${theme.border}`,
                backgroundColor: theme.isDark ? '#1f2937' : '#f9fafb',
                boxShadow: theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="Price ($)"
                  className={FIELD_CLS}
                  style={fieldStyle(theme)}
                />
                <input
                  type="number"
                  min="0"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  placeholder="Stock count"
                  className={FIELD_CLS}
                  style={fieldStyle(theme)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={formData.stripePriceId}
                  onChange={(e) => setFormData({ ...formData, stripePriceId: e.target.value.trim() })}
                  placeholder="Stripe Price ID"
                  className={`${FIELD_CLS} font-mono text-xs`}
                  style={fieldStyle(theme)}
                />
                <input
                  type="number"
                  min="0"
                  value={formData.restockThreshold}
                  onChange={(e) => setFormData({ ...formData, restockThreshold: e.target.value })}
                  placeholder="Restock alert at"
                  className={FIELD_CLS}
                  style={fieldStyle(theme)}
                />
              </div>
              <FieldHint theme={theme}>Paste Stripe Price ID from Dashboard. Email alert when stock hits threshold.</FieldHint>
            </div>
          </section>

          {/* Listing & SEO */}
          <section>
            <FormSectionHeader icon={LinkSimple} title="Listing Details" subtitle="URL & Description" theme={theme} />
            <div className="space-y-3">
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="URL slug (auto-generated if blank)"
                className={`${FIELD_CLS} font-mono text-xs`}
                style={fieldStyle(theme)}
              />

              <div>
                <div className="flex items-center justify-end mb-2">
                  <button
                    type="button"
                    onClick={handleGenerateDescription}
                    disabled={generatingDesc || !formData.images?.length}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-40"
                    style={{ backgroundColor: `${theme.primary}18`, color: theme.primary, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)' }}
                    title={formData.images?.length ? 'Generate description from your product image using AI' : 'Upload an image first'}
                  >
                    {generatingDesc ? <CircleNotch size={11} className="animate-spin" /> : <Sparkle size={11} />}
                    {generatingDesc ? 'Generating…' : '✦ AI Generate'}
                  </button>
                </div>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Product description for shop, Google, and social previews…"
                  rows={4}
                  className={`${FIELD_CLS} resize-none`}
                  style={fieldStyle(theme)}
                />
                <FieldHint theme={theme}>Auto-generated when you upload the main image if empty. Edit anytime for SEO.</FieldHint>
              </div>
            </div>
          </section>

          {formData.category === 'digital' && (
            <section>
              <FormSectionHeader icon={Download} title="Digital Download" subtitle="PDF Delivery" theme={theme} />
              <input ref={pdfInputRef} type="file" accept="application/pdf" className="sr-only" onChange={handlePdfUpload} />
              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                disabled={uploadingPdf}
                className="px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 w-full justify-center transition-all disabled:opacity-50"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.secondary,
                  color: theme.text,
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)',
                }}
              >
                {uploadingPdf ? <CircleNotch size={14} className="animate-spin" /> : <Download size={14} />}
                {formData.downloadStoragePath ? 'Replace PDF' : 'Upload PDF'}
              </button>
              {formData.downloadFileName && (
                <p className="text-xs mt-2 truncate" style={{ color: theme.textLight }}>{formData.downloadFileName}</p>
              )}
              {!formData.downloadStoragePath && (
                <p className="text-[11px] mt-1.5 text-amber-700">Required — without a PDF, customers cannot download after purchase.</p>
              )}
            </section>
          )}

          {formData.category !== 'planner' && (
            <section>
              <FormSectionHeader icon={Package} title="Product Specs" subtitle="Details Table" theme={theme} />
              <div
                className="px-3 pt-3 pb-3 rounded-lg space-y-2"
                style={{
                  border: theme.isDark ? 'none' : `1px solid ${theme.border}`,
                  backgroundColor: theme.isDark ? '#1f2937' : '#f9fafb',
                  boxShadow: theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                {(formData.specs || []).map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => updateSpecRow(idx, 'label', e.target.value)}
                      placeholder="Label"
                      className={`${FIELD_CLS} w-1/3 min-w-0`}
                      style={fieldStyle(theme)}
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => updateSpecRow(idx, 'value', e.target.value)}
                      placeholder="Value"
                      className={`${FIELD_CLS} flex-1 min-w-0`}
                      style={fieldStyle(theme)}
                    />
                    <button type="button" onClick={() => removeSpecRow(idx)} className="p-2 rounded-lg hover:bg-red-50 flex-shrink-0" aria-label="Remove spec">
                      <X size={14} className="text-red-400" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSpecRow}
                  className="mt-1 px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-2 w-full justify-center transition-all"
                  style={{
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.secondary,
                    color: theme.text,
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)',
                  }}
                >
                  <Plus size={14} /> Add Spec Row
                </button>
              </div>
              <FieldHint theme={theme}>Defaults load when you pick Accessory or Digital — edit per product.</FieldHint>
            </section>
          )}

          <section>
            <FormSectionHeader icon={Storefront} title="Marketplaces" subtitle="Etsy & TikTok" theme={theme} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={formData.platformIds.etsy}
                onChange={(e) => setFormData({ ...formData, platformIds: { ...formData.platformIds, etsy: e.target.value } })}
                placeholder="Etsy Listing ID"
                className={`${FIELD_CLS} font-mono text-xs`}
                style={fieldStyle(theme)}
              />
              <input
                type="text"
                value={formData.platformIds.tiktok}
                onChange={(e) => setFormData({ ...formData, platformIds: { ...formData.platformIds, tiktok: e.target.value } })}
                placeholder="TikTok Product ID"
                className={`${FIELD_CLS} font-mono text-xs`}
                style={fieldStyle(theme)}
              />
            </div>
          </section>

          <section>
            <FormSectionHeader
              icon={ImagesSquare}
              title="Product Images"
              subtitle={`${(formData.images || []).length}/${MAX_IMAGES} · Main & Hover`}
              theme={theme}
            />
            <div className="grid grid-cols-5 gap-2">
                {(formData.images || []).map((img, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => handleImgDragStart(e, idx)}
                    onDragOver={(e) => handleImgDragOver(e, idx)}
                    onDrop={(e) => handleImgDrop(e, idx)}
                    onDragEnd={handleImgDragEnd}
                    onClick={() => pickImageForSlot(idx)}
                    className="relative aspect-square rounded-lg overflow-hidden border group/img cursor-pointer transition-all"
                    style={{
                      borderColor: dragImgOver === idx ? theme.primary : theme.border,
                      borderWidth: dragImgOver === idx ? 2 : 1,
                      opacity: dragImgFrom.current === idx ? 0.4 : 1,
                    }}
                  >
                    <img
                      src={img?.url || img}
                      alt={`Image ${idx + 1}`}
                      className="w-full h-full object-cover pointer-events-none"
                    />

                    {/* Slot badge */}
                    <div className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold tracking-wide bg-black/40 text-white py-0.5 pointer-events-none">
                      {idx === 0 ? 'MAIN' : idx === 1 ? 'HOVER' : `#${idx + 1}`}
                    </div>

                    {/* Loading overlay */}
                    {uploadingIdx === idx && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 pointer-events-none">
                        <CircleNotch size={18} className="animate-spin" style={{ color: theme.primary }} />
                      </div>
                    )}

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemoveImageAtSlot(idx); }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity z-10"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}

                {/* Empty add slot */}
                {(formData.images || []).length < MAX_IMAGES && (
                  <div
                    onClick={() => pickImageForSlot((formData.images || []).length)}
                    className="relative aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:opacity-70 transition-opacity"
                    style={{ borderColor: theme.border, backgroundColor: theme.isDark ? '#1f2937' : '#f9fafb' }}
                  >
                    {uploadingIdx === (formData.images || []).length ? (
                      <CircleNotch size={18} className="animate-spin" style={{ color: theme.textLight }} />
                    ) : (
                      <>
                        <ImageIcon size={18} style={{ color: theme.textLight, opacity: 0.4 }} />
                        <span className="text-[9px] mt-1 font-semibold tracking-wide uppercase" style={{ color: theme.textLight, opacity: 0.5 }}>Add</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            <FieldHint theme={theme}>JPG, PNG, WebP · max 5MB each · drag to reorder · click to replace</FieldHint>
          </section>

          <section>
            <FormSectionHeader icon={Truck} title="Fulfillment" subtitle="Shipping & Visibility" theme={theme} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <PillToggle
                options={[{ value: true, label: 'Ships' }, { value: false, label: 'No Ship' }]}
                value={formData.requiresShipping}
                onChange={(v) => setFormData({ ...formData, requiresShipping: v })}
                theme={theme}
              />
              <PillToggle
                options={[{ value: true, label: 'Active' }, { value: false, label: 'Hidden' }]}
                value={formData.active}
                onChange={(v) => setFormData({ ...formData, active: v })}
                theme={theme}
              />
            </div>
          </section>

          <section>
              <button
                type="button"
                onClick={() => setShowRelated(!showRelated)}
                className="flex items-center gap-1.5 text-xs font-semibold mb-2 transition-colors hover:opacity-70"
                style={{ color: theme.textLight }}
              >
                {showRelated ? <CaretUp size={14} /> : <CaretDown size={14} />}
                Frequently Bought Together
                {formData.relatedProductIds.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: theme.primary }}>
                    {formData.relatedProductIds.length}
                  </span>
                )}
              </button>
              {showRelated && (
                <div
                  className="rounded-lg border p-3 space-y-1.5 max-h-48 overflow-y-auto"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.isDark ? '#1f2937' : '#f9fafb',
                    boxShadow: theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                  }}
                >
                  {products.filter((p) => p.id !== editingId).length === 0 ? (
                    <p className="text-xs" style={{ color: theme.textLight }}>No other products to link.</p>
                  ) : (
                    products.filter((p) => p.id !== editingId).map((p) => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer py-1 px-1 rounded hover:bg-black/5">
                        <input
                          type="checkbox"
                          checked={formData.relatedProductIds.includes(p.id)}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...formData.relatedProductIds, p.id]
                              : formData.relatedProductIds.filter((id) => id !== p.id);
                            setFormData({ ...formData, relatedProductIds: ids });
                          }}
                          className="w-3.5 h-3.5 rounded"
                        />
                        <span className="text-sm truncate" style={{ color: theme.text }}>{p.name}</span>
                        <span className="text-[10px] ml-auto flex-shrink-0" style={{ color: theme.textLight }}>
                          ${Number(p.price).toFixed(2)}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
          </section>
        </div>
      </AdminBottomSheet>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto min-w-0 -mx-1 px-1 pb-0.5">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${filterCategory === 'all' ? 'text-white' : ''}`}
          style={filterCategory === 'all' ? { backgroundColor: theme.primary } : { color: theme.textLight, backgroundColor: `${theme.text}08` }}
        >
          All ({products.length})
        </button>
        {CATEGORY_OPTIONS.map((cat) => {
          const count = products.filter((p) => p.category === cat.value).length;
          const active = filterCategory === cat.value;
          return (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(cat.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${active ? 'text-white' : ''}`}
              style={active ? { backgroundColor: theme.primary } : { color: theme.textLight, backgroundColor: `${theme.text}08` }}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Product List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <CircleNotch size={24} className="animate-spin" style={{ color: theme.primary }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color: theme.textLight }}>
            {products.length === 0 ? 'No products yet. Click "Add Product" to create your first one.' : 'No products in this category.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((product, index) => {
            const CatIcon = CATEGORY_ICONS[product.category] || BookOpen;
            return (
              <div
                key={product.id}
                draggable
                onDragStart={() => handleDragStart(products.indexOf(product))}
                onDragEnter={() => handleDragEnter(products.indexOf(product))}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm cursor-grab active:cursor-grabbing"
                style={{
                  backgroundColor: theme.cardBackground,
                  borderColor: theme.border,
                  opacity: product.active ? 1 : 0.55,
                }}
              >
                <DotsSixVertical size={16} className="flex-shrink-0 opacity-30" style={{ color: theme.textLight }} />

                {/* Thumbnail */}
                <div
                  className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ backgroundColor: `${theme.primary}08` }}
                >
                  {product.image ? (
                    <img src={typeof product.image === 'string' ? product.image : product.image.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <CatIcon size={18} style={{ color: theme.primary, opacity: 0.3 }} />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate" style={{ color: theme.text }}>{product.name}</span>
                    {!product.active && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">HIDDEN</span>
                    )}
                    {(product.stock === 0 || product.stock == null) && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        <Warning size={10} /> OUT OF STOCK
                      </span>
                    )}
                    {product.stock > 0 && product.stock <= (product.restockThreshold || 5) && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                        <Warning size={10} /> LOW STOCK
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs" style={{ color: theme.textLight }}>{PRODUCT_CATEGORIES[product.category]}</span>
                    {product.size && <span className="text-xs" style={{ color: theme.textLight }}>· {product.size}</span>}
                    <span className="text-xs font-semibold" style={{ color: theme.primary }}>${Number(product.price).toFixed(2)}</span>
                    {product.stock != null && (
                      <span className="text-xs" style={{ color: theme.textLight }}>· {product.stock} in stock</span>
                    )}
                  </div>
                  {product.stripePriceId && (
                    <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: theme.textLight, opacity: 0.6 }}>
                      {product.stripePriceId}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(product)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
                    title={product.active ? 'Hide from shop' : 'Show in shop'}
                  >
                    {product.active ? <Eye size={16} style={{ color: theme.primary }} /> : <EyeSlash size={16} style={{ color: theme.textLight }} />}
                  </button>
                  <button
                    onClick={() => openEditForm(product)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
                    title="Edit"
                  >
                    <PencilSimple size={16} style={{ color: theme.text }} />
                  </button>
                  <button
                    onClick={() => handleDelete(product)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash size={16} className="text-red-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}

