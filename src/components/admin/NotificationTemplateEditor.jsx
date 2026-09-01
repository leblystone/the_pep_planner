import React, { useState, useEffect, useMemo } from 'react';
import {
  FloppyDisk,
  ArrowsCounterClockwise,
  ChatCircle,
  Bell,
  Warning,
  PaperPlaneTilt,
  Clock,
  Lightning,
  Package,
  CreditCard,
  UsersFour,
  Funnel,
  Flask,
} from '@phosphor-icons/react';
import {
  loadAllTemplatesFromFirestore,
  saveNotificationTemplate,
  resetTemplatesToDefault,
  DEFAULT_TEMPLATES,
} from '../../utils/notificationTemplates';
import { AdminBottomSheet } from './adminUi';
import TextInput from '../common/inputs/TextInput';
import TextArea from '../common/inputs/TextArea';
import CustomDropdown from '../common/inputs/CustomDropdown';
import pwaNotificationService from '../../services/pwaNotifications';

/** Trigger / schedule metadata shown next to each live FCM template. */
export const TEMPLATE_TRIGGER_META = {
  notificationsEnabledConfirmation: {
    label: 'Notifications Enabled Confirmation',
    icon: 'bell',
    trigger: 'Instantly, the moment a user grants notification permission',
    rule: 'A user just turned on notifications (Settings toggle, first-launch prompt, or Android prompt)',
    prefType: 'system',
  },
  lowStock: {
    label: 'Low Stock',
    icon: 'warning',
    trigger: 'Checked once a day (around 2pm UTC)',
    rule: 'An item in their stockpile is at or below their low-stock alert level (usually 3)',
    prefType: 'lowStockAlerts',
  },
  orderStatusUpdate: {
    label: 'Order Status (manual)',
    icon: 'package',
    trigger: 'When you or the system updates an order status',
    rule: 'The order’s status text changes',
    prefType: 'orderStatusUpdates',
  },
  orderCarrierPickup: {
    label: 'Order — Carrier Pickup',
    icon: 'package',
    trigger: 'When shipping tracking updates',
    rule: 'The package was just picked up by the carrier (or first shows as in transit)',
    prefType: 'orderStatusUpdates',
  },
  orderOnTheWay: {
    label: 'Order — In Transit',
    icon: 'package',
    trigger: 'When shipping tracking updates',
    rule: 'The package is on the way after pickup',
    prefType: 'orderStatusUpdates',
  },
  orderOutForDelivery: {
    label: 'Order — Out for Delivery',
    icon: 'package',
    trigger: 'When shipping tracking updates',
    rule: 'The package is out for delivery today',
    prefType: 'orderStatusUpdates',
  },
  orderDelivered: {
    label: 'Order — Delivered',
    icon: 'package',
    trigger: 'When shipping tracking updates',
    rule: 'The package was marked delivered',
    prefType: 'orderStatusUpdates',
  },
  washoutReminder: {
    label: 'Washout Reminder',
    icon: 'clock',
    trigger: 'Checked once a day',
    rule: 'Their protocol has ended and they’re in a washout period',
    prefType: 'washoutReminders',
  },
  cycleReminder: {
    label: 'Cycle Starting Soon',
    icon: 'clock',
    trigger: 'Checked once a day',
    rule: 'A scheduled protocol is about to start',
    prefType: 'cycleReminders',
  },
  cycleEndReminder: {
    label: 'Cycle Ending Soon',
    icon: 'clock',
    trigger: 'Checked once a day',
    rule: 'An active protocol is about to end',
    prefType: 'cycleReminders',
  },
  researchReminderAM: {
    label: 'Morning Research',
    icon: 'bell',
    trigger: 'Around their morning reminder time (local time)',
    rule: 'Fires only if they have morning research scheduled. Unfinished → reminder list. All done → “morning research done” ping. Nothing scheduled → silent.',
    prefType: 'researchReminders',
  },
  researchReminderPM: {
    label: 'Evening Research',
    icon: 'bell',
    trigger: 'Around their evening reminder time (local time)',
    rule: 'Includes unfinished morning research that wasn’t checked off, plus evening items. Unfinished → reminder list. All done (morning leftovers + evening) → “Research is done for today”. Nothing left and no evening schedule → silent.',
    prefType: 'researchReminders',
  },
  researchReminderAMComplete: {
    label: 'Morning Research Done',
    icon: 'bell',
    trigger: 'At their morning reminder time (when morning list is fully complete)',
    rule: 'They had morning research scheduled and finished all of it before the reminder window',
    prefType: 'researchReminders',
  },
  researchReminderPMComplete: {
    label: 'Research Done for Today',
    icon: 'bell',
    trigger: 'At their evening reminder time (when today’s list is fully complete)',
    rule: 'Evening research was scheduled, morning leftovers (if any) are done, and evening items are done',
    prefType: 'researchReminders',
  },
  researchReminderCustom: {
    label: 'Custom Protocol Reminder',
    icon: 'bell',
    trigger: 'At a custom time they set for a peptide',
    rule: 'That peptide still has unfinished research for today',
    prefType: 'researchReminders',
  },
  titrationDoseChange: {
    label: 'Titration Dose Change',
    icon: 'lightning',
    trigger: 'With research reminders (throughout the day)',
    rule: 'Their titration dose changed from yesterday',
    prefType: 'researchReminders',
  },
  inactiveUser: {
    label: 'Inactive User Re-engage',
    icon: 'users',
    trigger: 'Periodic engagement check',
    rule: 'They haven’t opened the app in 14+ days',
    prefType: 'engagement',
  },
  unreadAnnouncements: {
    label: 'Unread Announcements',
    icon: 'bell',
    trigger: 'Periodic engagement check',
    rule: 'They have 5 or more unread announcements',
    prefType: 'engagement',
  },
  groupBuyReminder: {
    label: 'Group Buy T-2',
    icon: 'users',
    trigger: 'Group buy schedule check',
    rule: 'A group buy closes in 2 days',
    prefType: 'groupBuys',
  },
  supportTicketReply: {
    label: 'Support Has Responded',
    icon: 'chat',
    trigger: 'When an admin replies to a support ticket',
    rule: 'There’s a new team reply on their open support conversation',
    prefType: 'engagement',
  },
  researchPlusExpiringSoon: {
    label: 'Research+ Trial Expiring (3 days)',
    icon: 'billing',
    trigger: 'Subscription status check',
    rule: 'Their Research+ trial ends in exactly 3 days (paid renewals are email-only)',
    prefType: 'subscription',
  },
  paymentFailedSoon: {
    label: 'Payment Failed',
    icon: 'billing',
    trigger: 'When a payment fails',
    rule: 'Billing failed and their access is ending soon',
    prefType: 'subscription',
  },
};

const PREF_LABELS = {
  lowStockAlerts: 'Low stock alerts',
  orderStatusUpdates: 'Order status updates',
  washoutReminders: 'Washout reminders',
  cycleReminders: 'Cycle reminders',
  researchReminders: 'Research reminders',
  groupBuys: 'Group buys',
  engagement: 'Engagement',
  subscription: 'Subscription & billing',
  system: 'Push notifications (master toggle)',
};

const PREF_COLORS = {
  lowStockAlerts: '#f59e0b',
  orderStatusUpdates: '#10b981',
  washoutReminders: '#8b5cf6',
  cycleReminders: '#06b6d4',
  researchReminders: '#3b82f6',
  groupBuys: '#ec4899',
  engagement: '#6366f1',
  subscription: '#14b8a6',
  billing: '#ef4444',
  system: '#0ea5e9',
};

const CATEGORY_ORDER = [
  'system',
  'orderStatusUpdates',
  'researchReminders',
  'lowStockAlerts',
  'washoutReminders',
  'cycleReminders',
  'groupBuys',
  'engagement',
  'subscription',
];

const CATEGORY_META = {
  system: { label: 'System & Confirmations', Icon: Bell },
  orderStatusUpdates: { label: 'Orders', Icon: Package },
  researchReminders: { label: 'Research Reminders', Icon: Flask },
  lowStockAlerts: { label: 'Low Stock', Icon: Warning },
  washoutReminders: { label: 'Washout', Icon: Clock },
  cycleReminders: { label: 'Cycle', Icon: Clock },
  groupBuys: { label: 'Group Buys', Icon: UsersFour },
  engagement: { label: 'Engagement', Icon: Lightning },
  subscription: { label: 'Subscription & Billing', Icon: CreditCard },
};

function MetaIcon({ name, size = 16, weight = 'duotone', style }) {
  const props = { size, weight, style };
  switch (name) {
    case 'warning':
      return <Warning {...props} />;
    case 'package':
      return <Package {...props} />;
    case 'clock':
      return <Clock {...props} />;
    case 'lightning':
      return <Lightning {...props} />;
    case 'users':
      return <UsersFour {...props} />;
    case 'billing':
      return <CreditCard {...props} />;
    case 'chat':
      return <ChatCircle {...props} />;
    default:
      return <Bell {...props} />;
  }
}

function humanizeId(type) {
  return type.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

export default function NotificationTemplateEditor({ isOpen = false, onClose, theme, inline = false }) {
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [editedTemplate, setEditedTemplate] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    if (isOpen || inline) {
      loadTemplates();
    }
  }, [isOpen, inline]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const loadedTemplates = await loadAllTemplatesFromFirestore();
      setTemplates(loadedTemplates);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleTemplateSelect = (templateType) => {
    setSelectedTemplate(templateType);
    setEditedTemplate({ ...templates[templateType] });
    setHasChanges(false);
  };

  const handleCloseEditSheet = () => {
    setSelectedTemplate(null);
    setEditedTemplate(null);
    setHasChanges(false);
  };

  const handleTemplateChange = (field, value) => {
    setEditedTemplate((prev) => ({
      ...prev,
      [field]: value,
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedTemplate || !editedTemplate || saving) return;
    setSaving(true);
    try {
      const result = await saveNotificationTemplate(selectedTemplate, editedTemplate);
      if (result?.success) {
        setTemplates((prev) => ({
          ...prev,
          [selectedTemplate]: editedTemplate,
        }));
        setHasChanges(false);
        window.dispatchEvent(
          new CustomEvent('tpp:toast', {
            detail: {
              type: 'success',
              message: result.firestore
                ? 'Template saved to Firestore — live for all users.'
                : 'Saved locally only — Firestore write failed (check admin rules).',
            },
          })
        );
        if (!result.firestore) {
          window.dispatchEvent(
            new CustomEvent('tpp:toast', {
              detail: {
                type: 'error',
                message: result.error || 'Firestore denied the template write.',
              },
            })
          );
        }
      } else {
        window.dispatchEvent(
          new CustomEvent('tpp:toast', {
            detail: {
              type: 'error',
              message: result?.error || 'Failed to save notification template',
            },
          })
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (selectedTemplate) {
      setEditedTemplate({ ...DEFAULT_TEMPLATES[selectedTemplate] });
      setHasChanges(true);
    }
  };

  const handleResetAll = () => {
    const success = resetTemplatesToDefault();
    if (success) {
      setTemplates(DEFAULT_TEMPLATES);
      setSelectedTemplate(null);
      setEditedTemplate(null);
      setHasChanges(false);
      setShowResetConfirm(false);
      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: {
            type: 'success',
            message: 'Editor reset to code defaults (re-save each template to push to Firestore).',
          },
        })
      );
    }
  };

  const handleTestNotification = async () => {
    if (!selectedTemplate || !editedTemplate) {
      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: { type: 'error', message: 'Please select a template to test' },
        })
      );
      return;
    }

    try {
      const sampleData = getSampleDataForTemplate(selectedTemplate);
      const processedTemplate = { ...editedTemplate };
      Object.keys(sampleData).forEach((key) => {
        const placeholder = `{${key}}`;
        processedTemplate.title = processedTemplate.title?.replace(
          new RegExp(placeholder, 'g'),
          sampleData[key] || ''
        );
        processedTemplate.body = processedTemplate.body?.replace(
          new RegExp(placeholder, 'g'),
          sampleData[key] || ''
        );
      });

      const status = pwaNotificationService.getStatus();
      if (!status.supported) {
        window.dispatchEvent(
          new CustomEvent('tpp:toast', {
            detail: {
              type: 'error',
              message: 'Browser notifications not supported here — preview unavailable.',
            },
          })
        );
        return;
      }

      if (status.permission !== 'granted') {
        const permission = await pwaNotificationService.requestPermission();
        if (permission !== 'granted') {
          window.dispatchEvent(
            new CustomEvent('tpp:toast', {
              detail: {
                type: 'warning',
                message: 'Notification permission needed to preview template appearance',
              },
            })
          );
          return;
        }
      }

      pwaNotificationService.showNotification(processedTemplate.title, {
        body: processedTemplate.body,
        tag: `template-preview-${selectedTemplate}`,
        icon: '/tpp_logo.png',
        data: { path: processedTemplate.actionUrl || '/app/dashboard' },
      });

      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: { type: 'success', message: 'Template preview sent!' },
        })
      );
    } catch (error) {
      console.error('Failed to preview template:', error);
      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: { type: 'error', message: 'Failed to preview template: ' + error.message },
        })
      );
    }
  };

  const getSampleDataForTemplate = (templateType) => {
    const sampleData = {
      notificationsEnabledConfirmation: {},
      lowStock: { count: 2, peptideName: 'BPC-157' },
      orderStatusUpdate: { peptideName: 'Semaglutide', status: 'Shipped', additionalMessage: '' },
      orderCarrierPickup: { peptideName: 'BPC-157' },
      orderOnTheWay: { peptideName: 'TB-500' },
      orderOutForDelivery: { peptideName: 'Semaglutide' },
      orderDelivered: { peptideName: 'BPC-157' },
      washoutReminder: { protocolName: 'BPC-157 Protocol', daysAgo: 3 },
      cycleReminder: { protocolName: 'Recovery Protocol', daysUntil: 2 },
      cycleEndReminder: { protocolName: 'Recovery Protocol', daysUntil: 1 },
      researchReminderAM: { peptideList: 'BPC-157, TB-500' },
      researchReminderPM: { peptideList: 'Semaglutide' },
      researchReminderCustom: { peptideName: 'BPC-157', peptideList: 'BPC-157' },
      titrationDoseChange: { peptideName: 'BPC-157', oldDose: '250mcg', newDose: '500mcg' },
      inactiveUser: {},
      unreadAnnouncements: { count: 5 },
      groupBuyReminder: { peptideName: 'BPC-157 Group', daysUntil: 2 },
      supportTicketReply: { subject: 'Order question', subjectSuffix: ' (#Z138)' },
      researchPlusExpiringSoon: { daysLeft: 3 },
      paymentFailedSoon: {},
    };
    return sampleData[templateType] || {};
  };

  const selectedMeta = selectedTemplate ? TEMPLATE_TRIGGER_META[selectedTemplate] : null;
  const templateCount = Object.keys(templates).length;
  const pillShadow = theme.isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.08)';

  const groupedTemplates = useMemo(() => {
    const groups = {};
    Object.entries(templates).forEach(([type, template]) => {
      const prefType = TEMPLATE_TRIGGER_META[type]?.prefType || 'other';
      if (filterCategory !== 'all' && prefType !== filterCategory) return;
      if (!groups[prefType]) groups[prefType] = [];
      groups[prefType].push([type, template]);
    });
    const orderedKeys = [
      ...CATEGORY_ORDER.filter((k) => groups[k]?.length),
      ...Object.keys(groups).filter((k) => !CATEGORY_ORDER.includes(k)),
    ];
    return orderedKeys.map((key) => ({
      key,
      label: CATEGORY_META[key]?.label || humanizeId(key),
      Icon: CATEGORY_META[key]?.Icon || Bell,
      color: PREF_COLORS[key] || theme.primary,
      items: groups[key],
    }));
  }, [templates, filterCategory, theme.primary]);

  const filteredCount = groupedTemplates.reduce((sum, g) => sum + g.items.length, 0);

  const categoryOptions = useMemo(() => {
    const counts = {};
    Object.keys(templates).forEach((type) => {
      const prefType = TEMPLATE_TRIGGER_META[type]?.prefType || 'other';
      counts[prefType] = (counts[prefType] || 0) + 1;
    });
    return [
      {
        value: 'all',
        label: `All Categories (${templateCount})`,
        icon: <Funnel size={18} weight="duotone" style={{ color: theme.primary }} />,
      },
      ...CATEGORY_ORDER.filter((k) => counts[k]).map((key) => {
        const meta = CATEGORY_META[key];
        const Icon = meta?.Icon || Bell;
        const color = PREF_COLORS[key] || theme.primary;
        return {
          value: key,
          label: `${meta?.label || key} (${counts[key]})`,
          icon: <Icon size={18} weight="duotone" style={{ color }} />,
        };
      }),
    ];
  }, [templates, templateCount, theme.primary]);

  const renderTemplateCard = (type, template) => {
    const meta = TEMPLATE_TRIGGER_META[type] || {};
    const active = selectedTemplate === type;
    const iconColor = PREF_COLORS[meta.prefType] || theme.primary;
    return (
      <button
        key={type}
        type="button"
        onClick={() => handleTemplateSelect(type)}
        className="w-full text-left rounded-2xl border overflow-hidden transition-all hover:brightness-[0.99] active:scale-[0.995]"
        style={{
          borderColor: active ? theme.primary : theme.border,
          backgroundColor: active ? `${theme.primary}10` : theme.cardBackground,
          boxShadow: theme.isDark
            ? '0 4px 16px rgba(0,0,0,0.2)'
            : '0 4px 16px rgba(47,59,58,0.05)',
        }}
      >
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div
              className="flex-shrink-0 p-2.5 rounded-xl"
              style={{ backgroundColor: `${iconColor}18` }}
            >
              <MetaIcon name={meta.icon} size={20} style={{ color: iconColor }} />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-sm truncate" style={{ color: theme.text }}>
                {meta.label || humanizeId(type)}
              </h4>
              <p className="text-xs mt-0.5 truncate" style={{ color: theme.textLight }}>
                {template.title || 'No title'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {meta.trigger && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(47,59,58,0.05)',
                  color: theme.text,
                }}
              >
                <Lightning size={14} weight="duotone" style={{ color: theme.primary }} />
                {meta.trigger}
              </span>
            )}
            {meta.rule && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium line-clamp-1 max-w-full"
                style={{
                  backgroundColor: `${iconColor}18`,
                  color: iconColor,
                }}
                title={meta.rule}
              >
                <Clock size={14} weight="duotone" />
                {meta.rule}
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const resetAllButton = (
    <button
      type="button"
      onClick={() => setShowResetConfirm(true)}
      className="px-3 py-1 text-sm rounded-lg border transition-all hover:opacity-90"
      style={{
        borderColor: theme.border,
        color: theme.text,
        backgroundColor: theme.cardBackground,
      }}
    >
      <ArrowsCounterClockwise size={14} className="inline mr-1" />
      Reset All
    </button>
  );

  // Modal path — unchanged split layout
  const editorGrid = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      <div className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
            Templates & triggers
          </h3>
          <p className="text-xs mt-0.5" style={{ color: theme.textLight }}>
            {loadingTemplates
              ? 'Loading from Firestore…'
              : `${templateCount} FCM templates — each card shows when it fires`}
          </p>
        </div>
        <div className="space-y-2 overflow-y-auto max-h-96">
          {Object.entries(templates).map(([type, template]) => {
            const meta = TEMPLATE_TRIGGER_META[type] || {};
            const active = selectedTemplate === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => handleTemplateSelect(type)}
                className="w-full text-left p-3 rounded-lg border transition-all hover:shadow-md"
                style={{
                  borderColor: active ? theme.primary : theme.border,
                  backgroundColor: active ? `${theme.primary}12` : theme.cardBackground,
                  color: theme.text,
                  boxShadow: active ? `0 0 0 1px ${theme.primary}55` : undefined,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: theme.primary }}>
                    <MetaIcon name={meta.icon} />
                  </span>
                  <span className="font-medium text-sm">{meta.label || humanizeId(type)}</span>
                </div>
                <p className="text-[11px] opacity-80 leading-snug">
                  <span className="font-semibold opacity-90">Trigger: </span>
                  {meta.trigger || 'See editor for details'}
                </p>
                {meta.rule && (
                  <p className="text-[11px] opacity-60 mt-0.5 leading-snug line-clamp-2">{meta.rule}</p>
                )}
                <p className="text-[10px] mt-1.5 opacity-50 truncate">
                  Preview: {template.title}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        {selectedTemplate && editedTemplate ? (
          <>
            {selectedMeta && (
              <div
                className="rounded-lg border p-3 space-y-1.5"
                style={{
                  borderColor: `${theme.primary}40`,
                  backgroundColor: `${theme.primary}0c`,
                }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.primary }}>
                  When this sends
                </div>
                <div className="text-sm" style={{ color: theme.text }}>
                  <strong>Triggered by:</strong> {selectedMeta.trigger}
                </div>
                <div className="text-sm" style={{ color: theme.text }}>
                  <strong>Only if:</strong> {selectedMeta.rule}
                </div>
                <div className="text-xs opacity-70" style={{ color: theme.text }}>
                  User setting: {PREF_LABELS[selectedMeta.prefType] || selectedMeta.prefType}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-lg font-semibold" style={{ color: theme.text }}>
                Edit template
              </h3>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3 py-1 text-sm rounded-lg border transition-all hover:opacity-90"
                  style={{
                    borderColor: theme.border,
                    color: theme.text,
                    backgroundColor: theme.cardBackground,
                  }}
                >
                  <ArrowsCounterClockwise size={14} className="inline mr-1" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleTestNotification}
                  className="px-3 py-1 text-sm rounded-lg border transition-all hover:opacity-90"
                  style={{
                    borderColor: theme.primary,
                    color: theme.primary,
                    backgroundColor: theme.cardBackground,
                  }}
                >
                  <PaperPlaneTilt size={14} className="inline mr-1" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasChanges || saving}
                  className="px-3 py-1 text-sm rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: hasChanges ? theme.primary : theme.border,
                    color: hasChanges ? theme.textOnPrimary || '#fff' : theme.textLight,
                  }}
                >
                  <FloppyDisk size={14} className="inline mr-1" />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                  Title
                </label>
                <TextInput
                  value={editedTemplate.title || ''}
                  onChange={(value) => handleTemplateChange('title', value)}
                  placeholder="Notification title"
                  theme={theme}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                  Message Body
                </label>
                <TextArea
                  value={editedTemplate.body || ''}
                  onChange={(value) => handleTemplateChange('body', value)}
                  placeholder="Notification message"
                  rows={3}
                  theme={theme}
                />
                <p className="text-xs mt-1" style={{ color: theme.textLight }}>
                  Variables like {'{peptideName}'}, {'{count}'}, {'{daysLeft}'} are replaced at send time.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: theme.text }}>
                  Action URL
                </label>
                <TextInput
                  value={editedTemplate.actionUrl || ''}
                  onChange={(value) => handleTemplateChange('actionUrl', value)}
                  placeholder="/app/dashboard"
                  theme={theme}
                />
                <p className="text-xs mt-1" style={{ color: theme.textLight }}>
                  Opens this path when the notification is tapped.
                </p>
              </div>

              {hasChanges && (
                <div
                  className="p-3 rounded-lg border"
                  style={{
                    borderColor: `${theme.primary}50`,
                    backgroundColor: `${theme.primary}10`,
                  }}
                >
                  <p className="text-sm" style={{ color: theme.primary }}>
                    Unsaved changes — click Save to push to Firestore for all users.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <ChatCircle size={48} style={{ color: theme.textLight, opacity: 0.5 }} />
              <p className="mt-2" style={{ color: theme.textLight }}>
                Select a template to edit copy and review its trigger
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Inline path — Email / Tracking style sections
  const inlineEditor = (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2
          className="text-sm font-bold flex items-center gap-2 pb-1 border-b"
          style={{ color: theme.text, borderColor: theme.border }}
        >
          <Bell size={16} weight="duotone" style={{ color: theme.primary }} />
          Push Templates
          <span className="font-normal text-[11px]" style={{ color: theme.textLight }}>
            {loadingTemplates
              ? 'Loading…'
              : filterCategory === 'all'
                ? `${templateCount} templates`
                : `${filteredCount} of ${templateCount}`}
          </span>
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="ml-auto px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-wide flex items-center gap-1.5 transition-all hover:brightness-105 active:scale-[0.97] shrink-0"
            style={{
              backgroundColor: theme.cardBackground,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              boxShadow: pillShadow,
            }}
          >
            <ArrowsCounterClockwise size={14} weight="duotone" />
            Reset All
          </button>
        </h2>

        <div className="flex flex-nowrap items-center gap-2">
          <div className="flex-1 min-w-0">
            <CustomDropdown
              value={filterCategory}
              onChange={(val) => {
                setFilterCategory(val);
                setSelectedTemplate(null);
                setEditedTemplate(null);
                setHasChanges(false);
              }}
              options={categoryOptions}
              theme={theme}
              outlined
              customShadow
              placeholder="Category…"
            />
          </div>
        </div>

        <div className="space-y-5">
          {groupedTemplates.length === 0 ? (
            <div
              className="text-center py-10 rounded-2xl border"
              style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}
            >
              <Funnel size={36} weight="duotone" className="mx-auto mb-2 opacity-40" style={{ color: theme.textLight }} />
              <p className="text-sm" style={{ color: theme.textLight }}>
                No templates in this category
              </p>
            </div>
          ) : (
            groupedTemplates.map((group) => {
              const GroupIcon = group.Icon;
              return (
                <div key={group.key} className="space-y-3">
                  {filterCategory === 'all' && (
                    <div className="flex items-center gap-2 pt-1">
                      <GroupIcon size={14} weight="duotone" style={{ color: group.color }} />
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: theme.textLight }}
                      >
                        {group.label}
                      </span>
                      <span className="text-[10px]" style={{ color: theme.textLight }}>
                        ({group.items.length})
                      </span>
                    </div>
                  )}
                  <div className="space-y-3">
                    {group.items.map(([type, template]) => renderTemplateCard(type, template))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );

  const editFormContent = selectedTemplate && editedTemplate ? (
    <div className="space-y-4">
      {selectedMeta && (
        <div
          className="rounded-xl border p-3 space-y-1.5"
          style={{
            borderColor: `${theme.primary}40`,
            backgroundColor: `${theme.primary}0c`,
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.primary }}>
            When this sends
          </div>
          <div className="text-sm" style={{ color: theme.text }}>
            <strong>Triggered by:</strong> {selectedMeta.trigger}
          </div>
          <div className="text-sm" style={{ color: theme.text }}>
            <strong>Only if:</strong> {selectedMeta.rule}
          </div>
          <div className="text-xs" style={{ color: theme.textLight }}>
            User setting: {PREF_LABELS[selectedMeta.prefType] || selectedMeta.prefType}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: theme.text }}>
              Title
            </label>
            <TextInput
              value={editedTemplate.title || ''}
              onChange={(value) => handleTemplateChange('title', value)}
              placeholder="Notification title"
              theme={theme}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: theme.text }}>
              Message Body
            </label>
            <TextArea
              value={editedTemplate.body || ''}
              onChange={(value) => handleTemplateChange('body', value)}
              placeholder="Notification message"
              rows={4}
              theme={theme}
            />
            <p className="text-[11px] mt-1.5" style={{ color: theme.textLight }}>
              Variables like {'{peptideName}'}, {'{count}'}, {'{daysLeft}'} are replaced at send time.
            </p>
          </div>
        </div>

        {(() => {
          const sampleData = getSampleDataForTemplate(selectedTemplate);
          const fill = (text) => {
            if (!text) return '';
            return Object.keys(sampleData).reduce(
              (out, key) => out.replace(new RegExp(`\\{${key}\\}`, 'g'), sampleData[key] ?? ''),
              text
            );
          };
          const previewTitle = fill(editedTemplate.title) || 'Notification title';
          const previewBody = fill(editedTemplate.body) || 'Notification message';
          return (
            <div className="min-w-0">
              <div
                className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: theme.textLight }}
              >
                Phone preview
              </div>
              <div
                className="rounded-[2rem] border p-3 pb-5"
                style={{
                  borderColor: theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                  backgroundColor: theme.isDark ? '#1c1c1e' : '#e8eaed',
                  boxShadow: theme.isDark
                    ? '0 8px 32px rgba(0,0,0,0.45)'
                    : '0 8px 32px rgba(47,59,58,0.12)',
                }}
              >
                <div
                  className="mx-auto mb-3 h-1 w-16 rounded-full"
                  style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }}
                />
                <div
                  className="rounded-2xl px-3 py-2.5 shadow-sm"
                  style={{
                    backgroundColor: theme.isDark ? 'rgba(44,44,46,0.95)' : 'rgba(255,255,255,0.95)',
                    backdropFilter: 'blur(12px)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <img
                      src="/tpp_logo.png"
                      alt=""
                      className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className="text-[11px] font-medium truncate"
                          style={{ color: theme.isDark ? '#ebebf5' : '#3c3c43' }}
                        >
                          The Pep Planner
                        </span>
                        <span
                          className="text-[10px] shrink-0"
                          style={{ color: theme.isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)' }}
                        >
                          now
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-[13px] font-semibold leading-snug"
                    style={{ color: theme.isDark ? '#fff' : '#000' }}
                  >
                    {previewTitle}
                  </div>
                  <div
                    className="text-[12px] leading-snug mt-0.5 line-clamp-4"
                    style={{ color: theme.isDark ? 'rgba(235,235,245,0.7)' : 'rgba(60,60,67,0.75)' }}
                  >
                    {previewBody}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-2" style={{ color: theme.text }}>
          Action URL
        </label>
        <TextInput
          value={editedTemplate.actionUrl || ''}
          onChange={(value) => handleTemplateChange('actionUrl', value)}
          placeholder="/app/dashboard"
          theme={theme}
        />
        <p className="text-[11px] mt-1.5" style={{ color: theme.textLight }}>
          Opens this path when the notification is tapped.
        </p>
      </div>
    </div>
  ) : null;

  const editSheetFooter =
    selectedTemplate && editedTemplate ? (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleReset}
          className="px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-wide flex items-center gap-1.5 transition-all hover:brightness-105 active:scale-[0.97]"
          style={{
            backgroundColor: theme.cardBackground,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            boxShadow: pillShadow,
          }}
        >
          <ArrowsCounterClockwise size={14} weight="duotone" />
          Reset
        </button>
        <button
          type="button"
          onClick={handleTestNotification}
          className="px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-wide flex items-center gap-1.5 transition-all hover:brightness-105 active:scale-[0.97]"
          style={{
            backgroundColor: theme.cardBackground,
            color: theme.primary,
            border: `1px solid ${theme.primary}`,
            boxShadow: pillShadow,
          }}
        >
          <PaperPlaneTilt size={14} weight="duotone" />
          Preview
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="ml-auto px-4 py-1.5 rounded-full text-[11px] font-semibold tracking-wide flex items-center gap-1.5 transition-all hover:brightness-105 active:scale-[0.97] disabled:opacity-50"
          style={{
            backgroundColor: hasChanges ? theme.primary : theme.border,
            color: hasChanges ? theme.textOnPrimary || '#fff' : theme.textLight,
            boxShadow: hasChanges
              ? theme.isDark
                ? '0 2px 8px rgba(0,0,0,0.35)'
                : `0 2px 8px ${theme.primary}45`
              : undefined,
          }}
        >
          <FloppyDisk size={14} weight="duotone" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    ) : null;

  return (
    <>
      {inline ? (
        <>
          {inlineEditor}
          <AdminBottomSheet
            open={!!(selectedTemplate && editedTemplate)}
            onClose={handleCloseEditSheet}
            title={selectedMeta?.label || (selectedTemplate ? humanizeId(selectedTemplate) : 'Edit Template')}
            theme={theme}
            wide
            seamlessContent={false}
            fitContent
            footer={editSheetFooter}
          >
            {editFormContent}
          </AdminBottomSheet>
        </>
      ) : (
        <AdminBottomSheet
          open={isOpen}
          onClose={onClose}
          title="Notification Template Editor"
          titleExtra={<div className="flex items-center gap-2">{resetAllButton}</div>}
          theme={theme}
          wide
        >
          {editorGrid}
        </AdminBottomSheet>
      )}

      <AdminBottomSheet
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Reset all templates?"
        theme={theme}
        size="small"
      >
        <p className="text-sm mb-4" style={{ color: theme.text }}>
          This clears local overrides in this browser. Re-save templates to overwrite Firestore.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowResetConfirm(false)}
            className="px-3 py-1.5 rounded-lg border text-sm"
            style={{ borderColor: theme.border, color: theme.text }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleResetAll}
            className="px-3 py-1.5 rounded-lg text-sm"
            style={{ backgroundColor: theme.primary, color: '#fff' }}
          >
            Reset
          </button>
        </div>
      </AdminBottomSheet>
    </>
  );
}
