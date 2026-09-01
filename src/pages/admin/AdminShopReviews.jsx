import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Plus, PencilSimple, Trash, FloppyDisk, X, CircleNotch, Eye, EyeSlash, Upload,
} from '@phosphor-icons/react';
import {
  fetchAllShopReviews,
  saveShopReview,
  deleteShopReview,
  toggleShopReviewActive,
  importWebsiteReviewsSeed,
  websiteReviewsNeedResync,
  importEtsyReviewsSeed,
  etsyReviewsNeedResync,
} from '../../config/shopReviews';
import { REVIEW_SOURCE_IDS, REVIEW_SOURCES, getReviewSource } from '../../config/reviewSources';
import { uploadShopReviewPhoto, compressImage } from '../../utils/storageUtils';
import StarRating from '../../components/shop/StarRating';
import ReviewSourceBadge, { SourceIcon } from '../../components/shop/ReviewSourceBadge';
import { AdminBottomSheet } from '../../components/admin/adminUi';

const EMPTY_FORM = {
  authorName: '',
  authorLocation: '',
  productName: '',
  body: '',
  rating: 5,
  source: 'website',
  sourceUrl: '',
  photos: [],
  active: true,
  createdAt: '',
};

function toast(type, message) {
  window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { type, message } }));
}

function formatDateInput(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export default function AdminShopReviews({ embedded = false, theme: themeProp } = {}) {
  const outlet = useOutletContext();
  const theme = themeProp || outlet?.theme;
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [importingSeed, setImportingSeed] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await fetchAllShopReviews();
        let current = data;
        const needsWebsite = websiteReviewsNeedResync(current);
        const needsEtsy = etsyReviewsNeedResync(current);
        if (needsWebsite || needsEtsy) {
          setImportingSeed(true);
          try {
            if (needsWebsite) {
              const count = await importWebsiteReviewsSeed();
              toast('success', `Synced ${count} website reviews`);
              current = await fetchAllShopReviews();
            }
            if (etsyReviewsNeedResync(current)) {
              const count = await importEtsyReviewsSeed();
              toast('success', `Imported ${count} Etsy reviews`);
              current = await fetchAllShopReviews();
            }
            setReviews(current);
          } catch (importErr) {
            console.error(importErr);
            toast('error', 'Could not auto-import reviews. Deploy Firestore rules, then use the import buttons below.');
            setReviews(data);
          } finally {
            setImportingSeed(false);
          }
        } else {
          setReviews(data);
        }
      } catch (err) {
        console.error(err);
        toast('error', 'Failed to load reviews');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadReviews = async () => {
    try {
      setLoading(true);
      const data = await fetchAllShopReviews();
      setReviews(data);
    } catch (err) {
      console.error(err);
      toast('error', 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData({ ...EMPTY_FORM, createdAt: formatDateInput(new Date()) });
    setShowForm(true);
  };

  const openEdit = (review) => {
    setEditingId(review.id);
    setFormData({
      authorName: review.authorName || '',
      authorLocation: review.authorLocation || '',
      productName: review.productName || '',
      body: review.body || '',
      rating: review.rating || 5,
      source: review.source || 'website',
      sourceUrl: review.sourceUrl || '',
      photos: [...(review.photos || [])],
      active: review.active !== false,
      createdAt: formatDateInput(review.createdAt),
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingPhoto(true);
    try {
      const urls = [];
      for (const file of files) {
        const compressed = await compressImage(file, 1200, 0.85);
        const { url } = await uploadShopReviewPhoto(compressed, editingId || 'draft');
        urls.push(url);
      }
      setFormData((prev) => ({ ...prev, photos: [...prev.photos, ...urls] }));
      toast('success', `Uploaded ${urls.length} photo(s)`);
    } catch (err) {
      toast('error', err.message || 'Upload failed');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = (idx) => {
    setFormData((prev) => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== idx),
    }));
  };

  const handleImportWebsite = async () => {
    if (!window.confirm('Re-sync all 45 website reviews? Updates product names, ratings, and text from your Squarespace export.')) return;
    setImportingSeed(true);
    try {
      const count = await importWebsiteReviewsSeed();
      toast('success', `Imported ${count} website reviews`);
      await loadReviews();
    } catch (err) {
      console.error(err);
      toast('error', err.message || 'Import failed — deploy Firestore rules first');
    } finally {
      setImportingSeed(false);
    }
  };

  const handleImportEtsy = async () => {
    if (!window.confirm('Import / re-sync all 65 Etsy reviews from ThePepPlannerCo? Safe to re-run.')) return;
    setImportingSeed(true);
    try {
      const count = await importEtsyReviewsSeed();
      toast('success', `Imported ${count} Etsy reviews`);
      await loadReviews();
    } catch (err) {
      console.error(err);
      toast('error', err.message || 'Import failed — deploy Firestore rules first');
    } finally {
      setImportingSeed(false);
    }
  };

  const handleSave = async () => {
    if (!formData.authorName.trim()) {
      toast('error', 'Customer name is required');
      return;
    }
    if (!formData.body.trim() && !formData.productName.trim()) {
      toast('error', 'Add review text or product purchased');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        createdAt: formData.createdAt ? new Date(`${formData.createdAt}T12:00:00`) : undefined,
      };
      await saveShopReview(payload, editingId);
      toast('success', editingId ? 'Review updated' : 'Review added');
      closeForm();
      await loadReviews();
    } catch (err) {
      toast('error', err.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this review permanently?')) return;
    try {
      await deleteShopReview(id);
      toast('success', 'Review deleted');
      await loadReviews();
    } catch (err) {
      toast('error', 'Delete failed');
    }
  };

  return (
    <div className={embedded ? 'space-y-5' : 'p-4 md:p-6 max-w-5xl'}>
      <div className={`flex flex-wrap items-center justify-between gap-4 ${embedded ? '' : 'mb-6'}`}>
        <div>
          {!embedded && (
            <>
              <h1 className="text-2xl font-bold" style={{ color: theme.text }}>Shop reviews</h1>
              <p className="text-sm mt-1" style={{ color: theme.textLight }}>
                Store-wide reviews (not tied to individual products). Import manually from Etsy, TikTok, website, or community.
              </p>
            </>
          )}
          {embedded && (
            <p className="text-sm max-w-2xl" style={{ color: theme.textLight }}>
              Store-wide reviews (not tied to individual products). Import manually from Etsy, TikTok, website, or community.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleImportWebsite}
            disabled={importingSeed}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium"
            style={{ borderColor: theme.primary, color: theme.primary }}
          >
            {importingSeed ? <CircleNotch size={18} className="animate-spin" /> : null}
            Re-sync website reviews
          </button>
          <button
            type="button"
            onClick={handleImportEtsy}
            disabled={importingSeed}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium"
            style={{ borderColor: '#F1641E', color: '#F1641E' }}
          >
            {importingSeed ? <CircleNotch size={18} className="animate-spin" /> : null}
            Import Etsy reviews
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: theme.primary }}
          >
            <Plus size={18} /> Add review
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 p-3 rounded-xl border" style={{ borderColor: theme.accent, backgroundColor: theme.cardBackground }}>
        <span className="text-xs w-full mb-1" style={{ color: theme.textLight }}>Source badges (verification links):</span>
        {REVIEW_SOURCE_IDS.map((id) => (
          <span key={id} className="inline-flex items-center gap-1">
            <SourceIcon sourceId={id} size={18} />
            <span className="text-xs" style={{ color: getReviewSource(id).brandColor }}>{REVIEW_SOURCES[id].label}</span>
          </span>
        ))}
      </div>

      <AdminBottomSheet
        open={showForm}
        onClose={closeForm}
        title={editingId ? 'Edit review' : 'New review'}
        theme={theme}
        wide
        footer={(
          <>
            <button type="button" onClick={closeForm} className="px-4 py-2 rounded-lg border text-sm" style={{ borderColor: theme.border, color: theme.text }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-60"
              style={{
                background: isSaving ? theme.secondary : `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark || theme.primary} 100%)`,
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              {isSaving ? <CircleNotch size={16} className="animate-spin" /> : <FloppyDisk size={16} />}
              Save
            </button>
          </>
        )}
      >
        <div className="px-4 sm:px-5 space-y-4 pb-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium" style={{ color: theme.textLight }}>Customer name *</span>
              <input
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                value={formData.authorName}
                onChange={(e) => setFormData((p) => ({ ...p, authorName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: theme.textLight }}>Location (optional)</span>
              <input
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="e.g. Texas, USA"
                value={formData.authorLocation}
                onChange={(e) => setFormData((p) => ({ ...p, authorLocation: e.target.value }))}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium" style={{ color: theme.textLight }}>Product purchased</span>
            <input
              className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="e.g. Dreamy Pep Planner"
              value={formData.productName}
              onChange={(e) => setFormData((p) => ({ ...p, productName: e.target.value }))}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium" style={{ color: theme.textLight }}>Review text</span>
            <textarea
              rows={4}
              className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
              placeholder="Optional if product + rating only"
              value={formData.body}
              onChange={(e) => setFormData((p) => ({ ...p, body: e.target.value }))}
            />
          </label>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-xs font-medium block mb-2" style={{ color: theme.textLight }}>Star rating</span>
              <StarRating value={formData.rating} interactive onChange={(n) => setFormData((p) => ({ ...p, rating: n }))} size={22} />
            </div>
            <label className="block flex-1 min-w-[200px]">
              <span className="text-xs font-medium" style={{ color: theme.textLight }}>Review date (for imports)</span>
              <input
                type="date"
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                value={formData.createdAt}
                onChange={(e) => setFormData((p) => ({ ...p, createdAt: e.target.value }))}
              />
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium" style={{ color: theme.textLight }}>Source</span>
              <select
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                value={formData.source}
                onChange={(e) => setFormData((p) => ({ ...p, source: e.target.value }))}
              >
                {REVIEW_SOURCE_IDS.map((id) => (
                  <option key={id} value={id}>{REVIEW_SOURCES[id].label}</option>
                ))}
              </select>
              <div className="mt-2">
                <ReviewSourceBadge review={{ source: formData.source, sourceUrl: formData.sourceUrl }} iconOnly={false} />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: theme.textLight }}>Custom verify link (optional)</span>
              <input
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                placeholder={getReviewSource(formData.source).verifyUrl}
                value={formData.sourceUrl}
                onChange={(e) => setFormData((p) => ({ ...p, sourceUrl: e.target.value }))}
              />
              <p className="text-[10px] mt-1" style={{ color: theme.textLight }}>
                Link to the original Etsy/TikTok review or listing for verification.
              </p>
            </label>
          </div>

          <div>
            <span className="text-xs font-medium" style={{ color: theme.textLight }}>Customer photos</span>
            <div className="flex flex-wrap gap-3 mt-2">
              {formData.photos.map((url, i) => (
                <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded p-0.5"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs gap-1"
                style={{ borderColor: theme.accent, color: theme.textLight }}
              >
                {uploadingPhoto ? <CircleNotch size={16} className="animate-spin" /> : <Upload size={18} />}
                Photo
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) => setFormData((p) => ({ ...p, active: e.target.checked }))}
            />
            Visible on shop
          </label>
        </div>
      </AdminBottomSheet>

      {loading ? (
        <div className="flex justify-center py-16">
          <CircleNotch className="animate-spin" style={{ color: theme.primary }} />
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-center py-12 text-sm" style={{ color: theme.textLight }}>
          No reviews yet. Add your first import from Etsy or the website.
        </p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((review) => (
            <li
              key={review.id}
              className="p-4 rounded-xl border flex flex-col sm:flex-row gap-4"
              style={{
                borderColor: theme.accent,
                backgroundColor: theme.cardBackground,
                opacity: review.active ? 1 : 0.55,
              }}
            >
              {review.photos?.[0] && (
                <img
                  src={review.photos[0]}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <StarRating value={review.rating} size={14} />
                  <ReviewSourceBadge review={review} size="sm" />
                  {!review.active && (
                    <span className="text-[10px] uppercase font-bold text-amber-600">Hidden</span>
                  )}
                </div>
                {review.productName && (
                  <p className="text-xs font-semibold mb-1" style={{ color: theme.primary }}>
                    {review.productName}
                  </p>
                )}
                {review.body ? (
                  <p className="text-sm line-clamp-2" style={{ color: theme.text }}>“{review.body}”</p>
                ) : (
                  <p className="text-sm italic" style={{ color: theme.textLight }}>No written review</p>
                )}
                <p className="text-xs mt-1" style={{ color: theme.textLight }}>
                  {review.authorName}
                  {review.authorLocation ? ` · ${review.authorLocation}` : ''}
                  {review.createdAt
                    ? ` · ${review.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  title={review.active ? 'Hide' : 'Show'}
                  onClick={async () => {
                    await toggleShopReviewActive(review.id, review.active);
                    loadReviews();
                  }}
                  className="p-2 rounded-lg hover:bg-black/5"
                >
                  {review.active ? <Eye size={18} /> : <EyeSlash size={18} />}
                </button>
                <button type="button" onClick={() => openEdit(review)} className="p-2 rounded-lg hover:bg-black/5">
                  <PencilSimple size={18} />
                </button>
                <button type="button" onClick={() => handleDelete(review.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-600">
                  <Trash size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
