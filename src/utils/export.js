import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { themes, defaultThemeName } from '../theme/themes';

// Field mappings for organized CSV exports
const FIELD_ORDER = {
  protocol: ['protocolName', 'name', 'linkedItems', 'duration', 'washout', 'notes', 'startDate', 'endDate', 'status'],
  order: ['item', 'vendor', 'status', 'orderDate', 'deliveredDate', 'cost', 'quantity', 'notes'],
  stockpile: ['name', 'peptide', 'quantity', 'unit', 'mg', 'vendor', 'batch', 'expiration', 'location', 'notes'],
  vendor: ['name', 'type', 'website', 'email', 'phone', 'rating', 'paymentMethods', 'shippingMethods', 'notes'],
  supplement: ['name', 'type', 'brand', 'dosage', 'frequency', 'purpose', 'notes'],
  recon_item: ['name', 'peptide', 'bacWater', 'peptideAmount', 'totalVolume', 'concentration', 'reconDate', 'expiration', 'penColor', 'deliveryMethod', 'notes'],
  recon_history: ['reconItem', 'date', 'amount', 'notes'],
  scheduled_buy: ['item', 'vendor', 'scheduledDate', 'quantity', 'cost', 'notes'],
  metric: ['date', 'name', 'value', 'unit', 'notes'],
  calendar_note: ['date', 'note'],
  glossary: ['term', 'definition', 'category'],
  goal: ['title', 'targetDate', 'completed', 'createdAt', 'archived', 'archivedAt'],
  protocol_history: ['protocolName', 'startDate', 'endDate', 'completionStatus', 'notes', 'followUpNotes'],
  // Previously missing data types
  wishlist_item: ['name', 'vendor', 'price', 'priority', 'notes', 'link'],
  user_note: ['title', 'content', 'category', 'pinned'],
  water_entry: ['date', 'glasses', 'goal', 'unit'],
  task_entry: ['date', 'timeSlot', 'tasks'],
  injection: ['date', 'peptide', 'site', 'dose', 'unit', 'notes']
};

// Fields to exclude from exports (backend/admin only) - all lowercase for comparison
const EXCLUDED_FIELDS = ['id', '_id', 'uid', 'userid', 'createdat', 'updatedat', 'timestamp', 'servertimestamp', 'blendmode', 'protocoltype', 'endtype', 'peptides', 'protocoldata', 'reconstitutiondata', 'skippedreconstitution', 'vialsaddedduring', 'vials', 'protocolid', 'needscompletion', 'reliability'];

// Helper function to check if a field should be excluded
function shouldExcludeField(fieldName) {
  const lower = fieldName.toLowerCase();
  // Exclude common ID patterns
  if (EXCLUDED_FIELDS.includes(lower)) return true;
  if (lower.endsWith('id') && lower !== 'peptide') return true; // Allow 'peptide' field
  if (lower === 'type') return true; // Exclude type field used for categorization
  return false;
}

// Helper function to get ordered fields for a data type
function getOrderedFields(type, item) {
  const ordered = FIELD_ORDER[type] || [];
  const allFields = Object.keys(item);
  // Filter out excluded fields and IDs
  const filteredFields = allFields.filter(f => !shouldExcludeField(f));
  const orderedFields = ordered.filter(f => filteredFields.includes(f));
  const remainingFields = filteredFields.filter(f => !ordered.includes(f)).sort();
  return [...orderedFields, ...remainingFields];
}

// Convert duration object to readable string
function formatDuration(duration) {
  if (!duration) return '';
  if (typeof duration === 'string') return duration;
  if (typeof duration === 'object') {
    if (duration.noEnd) return 'Ongoing';
    if (duration.count && duration.unit) {
      const count = duration.count;
      const unit = String(duration.unit).toLowerCase();
      return `${count} ${unit}${count !== '1' ? 's' : ''}`;
    }
    return '';
  }
  return String(duration);
}

// Convert washout object to readable string
function formatWashout(washout) {
  if (!washout) return 'No';
  if (typeof washout === 'string') return washout;
  if (typeof washout === 'object') {
    // Check if washout is enabled
    if (washout.enabled === false || washout.enabled === 'false') {
      return 'No';
    }
    if (washout.enabled === true || washout.enabled === 'true' || washout.count) {
      const parts = [];
      if (washout.count && washout.unit) {
        const count = washout.count;
        const unit = String(washout.unit).toLowerCase();
        parts.push(`${count} ${unit}${count !== '1' ? 's' : ''}`);
      }
      if (washout.duration) {
        const durationStr = formatDuration(washout.duration);
        if (durationStr) parts.push(durationStr);
      }
      return parts.length > 0 ? parts.join(' ') : 'Yes';
    }
    return 'No';
  }
  return String(washout);
}

// Convert boolean to yes/no
function formatBoolean(value) {
  if (value === true || value === 'true') return 'Yes';
  if (value === false || value === 'false') return 'No';
  return '';
}

// Helper function to format linkedItems for protocols - convert to readable format
function formatProtocolLinkedItems(protocol, stockpile = []) {
  if (!protocol.linkedItems || typeof protocol.linkedItems !== 'object') return '';
  
  const formattedLinks = [];
  const peptides = protocol.peptides || [];
  
  Object.entries(protocol.linkedItems).forEach(([peptideId, linkedItem]) => {
    // Find peptide name
    const peptide = peptides.find(p => (p.id || '').toString() === peptideId.toString()) || {};
    const peptideName = peptide.name || 'Unknown Peptide';
    
    // Find vendor name from stockpile if vialId exists
    let vendorName = 'No Vendor';
    if (linkedItem.vialId) {
      const vial = stockpile.find(v => (v.id || '').toString() === linkedItem.vialId.toString());
      if (vial && vial.vendor) {
        vendorName = vial.vendor;
      }
    } else if (linkedItem.vendor) {
      // Some linkedItems might have vendor directly
      vendorName = linkedItem.vendor;
    }
    
    formattedLinks.push(`${peptideName}: ${vendorName}`);
  });
  
  return formattedLinks.join('; ');
}

// Improved CSV export with organized sections
export function exportUserDataToCSV(data, filename = null) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = now.getFullYear();
  const dateStr = `${month}-${day}-${year}`;
  const defaultFilename = `The Pep Planner ${dateStr}.csv`;
  filename = filename || defaultFilename;
  
  const csvLines = [];
  
  // Add BOM for proper UTF-8 encoding in Excel
  csvLines.push('\uFEFF');
  
  // Professional header with branding
  csvLines.push('═══════════════════════════════════════════════════════════════');
  csvLines.push('                    THE PEP PLANNER');
  csvLines.push('                  Research Data Export');
  csvLines.push('═══════════════════════════════════════════════════════════════');
  csvLines.push('');
  csvLines.push(`Exported: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`);
  csvLines.push('');
  
  // Convert calendarNotes object to array if needed
  const calendarNotesArray = data.calendarNotes && typeof data.calendarNotes === 'object' && !Array.isArray(data.calendarNotes)
    ? Object.entries(data.calendarNotes).map(([date, note]) => ({ date, note: typeof note === 'string' ? note : JSON.stringify(note) }))
    : (data.calendarNotes || []);
  
  // Pre-process protocols to format linkedItems
  const processedProtocols = (data.protocols || []).map(protocol => {
    if (protocol.linkedItems) {
      return {
        ...protocol,
        linkedItems: formatProtocolLinkedItems(protocol, data.stockpile || [])
      };
    }
    return protocol;
  });

  // Flatten protocol history notes for export with proper formatting
  const protocolHistoryWithNotes = (data.protocolHistory || []).map(entry => {
    const notes = entry.notes || [];
    const duringNotes = notes.filter(n => n.type === 'during').map(n => n.content).join(' | ');
    const followUpNotes = notes.filter(n => n.type === 'follow_up').map(n => n.content).join(' | ');
    // Format completion status
    let completionStatus = '';
    if (entry.completionStatus === 'completed') completionStatus = 'Completed';
    else if (entry.completionStatus === 'active') completionStatus = 'Active';
    else if (entry.completionStatus === 'cancelled') completionStatus = 'Cancelled';
    else if (entry.completionStatus === 'ended_reengagement') completionStatus = 'Closed on Return';
    else if (entry.endDate) completionStatus = 'Completed';
    else completionStatus = 'Active';
    return {
      ...entry,
      notes: duringNotes || '',
      followUpNotes: followUpNotes || '',
      notesCount: notes.length,
      completionStatus: completionStatus
    };
  });

  // Convert object-keyed data to flat arrays for export
  const waterTrackerArray = data.waterTracker && typeof data.waterTracker === 'object' && !Array.isArray(data.waterTracker)
    ? Object.entries(data.waterTracker).map(([date, entry]) => ({ date, ...(typeof entry === 'object' ? entry : { glasses: entry }) }))
    : [];

  const taskCompletionArray = data.taskCompletion && typeof data.taskCompletion === 'object' && !Array.isArray(data.taskCompletion)
    ? Object.entries(data.taskCompletion).map(([date, slots]) => ({ date, timeSlot: Object.keys(slots || {}).join(', '), tasks: JSON.stringify(slots) }))
    : [];

  const calendarDoneArray = data.calendarDone && typeof data.calendarDone === 'object' && !Array.isArray(data.calendarDone)
    ? Object.entries(data.calendarDone).map(([date, slots]) => ({ date, timeSlot: Object.keys(slots || {}).join(', '), tasks: JSON.stringify(slots) }))
    : [];

  // Export each data type in its own section with proper labels
  const dataTypes = [
    { key: 'protocols', label: 'Protocols', data: processedProtocols },
    { key: 'protocolHistory', label: 'Protocol History', data: protocolHistoryWithNotes },
    { key: 'orders', label: 'Orders', data: data.orders || [] },
    { key: 'stockpile', label: 'Stockpile', data: data.stockpile || [] },
    { key: 'vendors', label: 'Vendors', data: data.vendors || [] },
    { key: 'supplements', label: 'Supplements', data: data.supplements || [] },
    { key: 'reconItems', label: 'Reconstituted Items', data: data.reconItems || [] },
    { key: 'reconHistory', label: 'Reconstitution History', data: data.reconHistory || [] },
    { key: 'scheduledBuys', label: 'Scheduled Buys', data: data.scheduledBuys || [] },
    { key: 'metrics', label: 'Metrics', data: data.metrics || [] },
    { key: 'calendarNotes', label: 'Calendar Notes', data: calendarNotesArray },
    { key: 'goals', label: 'Goals', data: data.goals || [] },
    { key: 'glossary', label: 'Glossary', data: data.glossary || [] },
    // Previously missing data types — now included for complete backup
    { key: 'wishlist', label: 'Wishlist', data: data.wishlist || [] },
    { key: 'userNotes', label: 'User Notes', data: data.userNotes || [] },
    { key: 'injectionHistory', label: 'Injection History', data: data.injectionHistory || [] },
    { key: 'waterTracker', label: 'Water Tracker', data: waterTrackerArray },
    { key: 'taskCompletion', label: 'Task Completion', data: taskCompletionArray },
    { key: 'calendarDone', label: 'Calendar Tasks Done', data: calendarDoneArray },
  ];
  
  dataTypes.forEach(({ key, label, data: items }) => {
    if (items.length === 0) return;
    
    // Professional section header
    csvLines.push('');
    csvLines.push('─────────────────────────────────────────────────────────────');
    csvLines.push(`${label} (${items.length} ${items.length === 1 ? 'item' : 'items'})`);
    csvLines.push('─────────────────────────────────────────────────────────────');
    
    // Get ordered fields for this data type
    const typeKey = key === 'reconItems' ? 'recon_item' : 
                    key === 'reconHistory' ? 'recon_history' :
                    key === 'scheduledBuys' ? 'scheduled_buy' :
                    key === 'calendarNotes' ? 'calendar_note' :
                    key === 'protocolHistory' ? 'protocol_history' :
                    key === 'goals' ? 'goal' :
                    key === 'wishlist' ? 'wishlist_item' :
                    key === 'userNotes' ? 'user_note' :
                    key === 'waterTracker' ? 'water_entry' :
                    key === 'taskCompletion' ? 'task_entry' :
                    key === 'calendarDone' ? 'task_entry' :
                    key === 'injectionHistory' ? 'injection' :
                    key.slice(0, -1); // Remove 's' from plural
    
    const firstItem = items[0];
    const headers = getOrderedFields(typeKey, firstItem);
    
    if (headers.length > 0) {
      // Add headers with proper formatting
      csvLines.push(headers.map(h => csvEscape(formatFieldName(h))).join(','));
      
      // Add data rows with formatted values
      items.forEach(item => {
        const values = headers.map(h => csvEscape(formatValue(item[h], false, h)));
        csvLines.push(values.join(','));
      });
    }
  });
  
  // Professional summary section
  csvLines.push('');
  csvLines.push('═══════════════════════════════════════════════════════════════');
  csvLines.push('                            SUMMARY');
  csvLines.push('═══════════════════════════════════════════════════════════════');
  csvLines.push('');
  
  let totalItems = 0;
  dataTypes.forEach(({ label, data: items }) => {
    if (items.length > 0) {
      totalItems += items.length;
      csvLines.push(`${label}: ${items.length} ${items.length === 1 ? 'item' : 'items'}`);
    }
  });
  
  csvLines.push('');
  csvLines.push(`Total Items: ${totalItems}`);
  csvLines.push('');
  csvLines.push('═══════════════════════════════════════════════════════════════');
  csvLines.push('This export contains all your research data from The Pep Planner.');
  csvLines.push('Your data is always yours - export anytime, anywhere.');
  csvLines.push('═══════════════════════════════════════════════════════════════');
  
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}

// Helper to convert hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 127, g: 158, b: 149 }; // Default sage color
}

// Helper to load logo as base64
async function loadLogoAsBase64() {
  try {
    const logoPaths = [
      '/tpp_logo.png',
      './tpp_logo.png',
      window.location.origin + '/tpp_logo.png'
    ];
    
    for (const logoPath of logoPaths) {
      try {
        const response = await fetch(logoPath);
        if (response.ok) {
          const blob = await response.blob();
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } catch (err) {
        continue;
      }
    }
  } catch (error) {
    console.warn('Could not load logo:', error);
  }
  return null;
}

// PDF export with branding
export async function exportUserDataToPDF(data, filename = null, theme = null) {
  const defaultTheme = themes[defaultThemeName];
  const activeTheme = theme || defaultTheme;
  
  const primaryRgb = hexToRgb(activeTheme.primary);
  const primaryDarkRgb = hexToRgb(activeTheme.primaryDark);
  const textRgb = hexToRgb(activeTheme.text);
  const textLightRgb = hexToRgb(activeTheme.textLight);
  const backgroundRgb = hexToRgb(activeTheme.background);
  
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = now.getFullYear();
  const dateStr = `${month}-${day}-${year}`;
  const defaultFilename = `The Pep Planner ${dateStr}.pdf`;
  filename = filename || defaultFilename;
  
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 0;
  
  const logoBase64 = await loadLogoAsBase64();
  
  const headerHeight = 50;
  doc.setFillColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  
  const overlayR = Math.floor(primaryRgb.r * 0.7);
  const overlayG = Math.floor(primaryRgb.g * 0.7);
  const overlayB = Math.floor(primaryRgb.b * 0.7);
  doc.setFillColor(overlayR, overlayG, overlayB);
  doc.rect(0, 0, pageWidth, 15, 'F');
  
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 20, 10, 30, 30);
      yPos = 25;
    } catch (error) {
      yPos = 20;
    }
  } else {
    yPos = 20;
  }
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('The Pep Planner', logoBase64 ? 60 : pageWidth / 2, yPos, { 
    align: logoBase64 ? 'left' : 'center' 
  });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Research Data Export', logoBase64 ? 60 : pageWidth / 2, yPos + 7, { 
    align: logoBase64 ? 'left' : 'center' 
  });
  
  yPos = headerHeight + 15;
  
  doc.setFillColor(backgroundRgb.r, backgroundRgb.g, backgroundRgb.b);
  doc.roundedRect(14, yPos - 5, pageWidth - 28, 12, 2, 2, 'F');
  
  doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Exported: ${new Date().toLocaleString()}`, 20, yPos + 2);
  
  const totalItems = Object.values(data).reduce((sum, arr) => {
    if (Array.isArray(arr)) return sum + arr.length;
    if (typeof arr === 'object' && arr !== null && !Array.isArray(arr)) {
      return sum + Object.keys(arr).length;
    }
    return sum;
  }, 0);
  
  doc.text(`Total Items: ${totalItems}`, pageWidth - 20, yPos + 2, { align: 'right' });
  yPos += 20;
  
  const calendarNotesArray = data.calendarNotes && typeof data.calendarNotes === 'object' && !Array.isArray(data.calendarNotes)
    ? Object.entries(data.calendarNotes).map(([date, note]) => ({ date, note: typeof note === 'string' ? note : JSON.stringify(note) }))
    : (data.calendarNotes || []);

  // Pre-process protocols to format linkedItems for PDF export
  const processedProtocolsPDF = (data.protocols || []).map(protocol => {
    if (protocol.linkedItems) {
      return {
        ...protocol,
        linkedItems: formatProtocolLinkedItems(protocol, data.stockpile || [])
      };
    }
    return protocol;
  });

  // Convert object-keyed data to flat arrays for PDF export
  const waterTrackerArrayPDF = data.waterTracker && typeof data.waterTracker === 'object' && !Array.isArray(data.waterTracker)
    ? Object.entries(data.waterTracker).map(([date, entry]) => ({ date, ...(typeof entry === 'object' ? entry : { glasses: entry }) }))
    : [];

  const taskCompletionArrayPDF = data.taskCompletion && typeof data.taskCompletion === 'object' && !Array.isArray(data.taskCompletion)
    ? Object.entries(data.taskCompletion).map(([date, slots]) => ({ date, timeSlot: Object.keys(slots || {}).join(', '), tasks: JSON.stringify(slots) }))
    : [];

  const calendarDoneArrayPDF = data.calendarDone && typeof data.calendarDone === 'object' && !Array.isArray(data.calendarDone)
    ? Object.entries(data.calendarDone).map(([date, slots]) => ({ date, timeSlot: Object.keys(slots || {}).join(', '), tasks: JSON.stringify(slots) }))
    : [];

  const dataTypes = [
    { key: 'protocols', label: 'Protocols', data: processedProtocolsPDF },
    { key: 'protocolHistory', label: 'Protocol History', data: (data.protocolHistory || []).map(entry => {
      const notes = entry.notes || [];
      const duringNotes = notes.filter(n => n.type === 'during').map(n => n.content).join(' | ');
      const followUpNotes = notes.filter(n => n.type === 'follow_up').map(n => n.content).join(' | ');
      // Format completion status
      let completionStatus = '';
      if (entry.completionStatus === 'completed') completionStatus = 'Completed';
      else if (entry.completionStatus === 'active') completionStatus = 'Active';
      else if (entry.completionStatus === 'cancelled') completionStatus = 'Cancelled';
      else if (entry.completionStatus === 'ended_reengagement') completionStatus = 'Closed on Return';
      else if (entry.endDate) completionStatus = 'Completed';
      else completionStatus = 'Active';
      return {
        ...entry,
        notes: duringNotes || '',
        followUpNotes: followUpNotes || '',
        notesCount: notes.length,
        completionStatus: completionStatus
      };
    }) },
    { key: 'orders', label: 'Orders', data: data.orders || [] },
    { key: 'stockpile', label: 'Stockpile', data: data.stockpile || [] },
    { key: 'vendors', label: 'Vendors', data: data.vendors || [] },
    { key: 'supplements', label: 'Supplements', data: data.supplements || [] },
    { key: 'reconItems', label: 'Reconstituted Items', data: data.reconItems || [] },
    { key: 'reconHistory', label: 'Reconstitution History', data: data.reconHistory || [] },
    { key: 'scheduledBuys', label: 'Scheduled Buys', data: data.scheduledBuys || [] },
    { key: 'metrics', label: 'Metrics', data: data.metrics || [] },
    { key: 'calendarNotes', label: 'Calendar Notes', data: calendarNotesArray },
    { key: 'goals', label: 'Goals', data: data.goals || [] },
    { key: 'glossary', label: 'Glossary', data: data.glossary || [] },
    // Previously missing data types — now included for complete backup
    { key: 'wishlist', label: 'Wishlist', data: data.wishlist || [] },
    { key: 'userNotes', label: 'User Notes', data: data.userNotes || [] },
    { key: 'injectionHistory', label: 'Injection History', data: data.injectionHistory || [] },
    { key: 'waterTracker', label: 'Water Tracker', data: waterTrackerArrayPDF },
    { key: 'taskCompletion', label: 'Task Completion', data: taskCompletionArrayPDF },
    { key: 'calendarDone', label: 'Calendar Tasks Done', data: calendarDoneArrayPDF },
  ];
  
  dataTypes.forEach(({ key, label, data: items }) => {
    if (items.length === 0) return;
    
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = 20;
    }
    
    const sectionHeaderHeight = 8;
    doc.setFillColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
    doc.roundedRect(14, yPos - 6, pageWidth - 28, sectionHeaderHeight, 1, 1, 'F');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`${label}`, 20, yPos);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`(${items.length} items)`, pageWidth - 20, yPos, { align: 'right' });
    yPos += 8;
    
    const typeKey = key === 'reconItems' ? 'recon_item' : 
                    key === 'reconHistory' ? 'recon_history' :
                    key === 'scheduledBuys' ? 'scheduled_buy' :
                    key === 'calendarNotes' ? 'calendar_note' :
                    key === 'protocolHistory' ? 'protocol_history' :
                    key === 'goals' ? 'goal' :
                    key === 'wishlist' ? 'wishlist_item' :
                    key === 'userNotes' ? 'user_note' :
                    key === 'waterTracker' ? 'water_entry' :
                    key === 'taskCompletion' ? 'task_entry' :
                    key === 'calendarDone' ? 'task_entry' :
                    key === 'injectionHistory' ? 'injection' :
                    key.slice(0, -1);
    
    const firstItem = items[0];
    const headers = getOrderedFields(typeKey, firstItem);
    
    if (headers.length > 0 && items.length > 0) {
      const tableData = items.map(item => 
        headers.map(h => formatValue(item[h], true, h))
      );
      
      const tableHeaders = headers.map(h => formatFieldName(h));
      
      // Calculate column widths to fit page
      const margins = 28; // 14 left + 14 right
      const availableWidth = pageWidth - margins;
      const numColumns = headers.length;
      
      // Build column styles with proper widths - adjust for tables with many columns
      const columnStyles = {};
      
      // For tables with many columns (like orders), use smaller widths and allow horizontal overflow
      if (numColumns > 8) {
        // Use smaller font and tighter spacing for wide tables
        const baseWidth = Math.max(availableWidth / numColumns, 8); // Minimum 8mm per column
        headers.forEach((_, index) => {
          columnStyles[index] = { 
            cellWidth: baseWidth,
            overflow: 'linebreak',
            cellPadding: 1.5,
            minCellHeight: 3,
            fontSize: 6 // Smaller font for wide tables
          };
        });
      } else {
        // Normal table sizing
        const baseWidth = availableWidth / numColumns;
        const maxWidth = 35; // Max width per column in mm
        const minWidth = 12; // Min width per column in mm
        const columnWidth = Math.max(Math.min(baseWidth, maxWidth), minWidth);
        
        headers.forEach((_, index) => {
          columnStyles[index] = { 
            cellWidth: columnWidth,
            overflow: 'linebreak',
            cellPadding: 2,
            minCellHeight: 4
          };
        });
      }
      
      // Adjust font size for wide tables
      const baseFontSize = numColumns > 8 ? 6 : 7;
      const headerFontSize = numColumns > 8 ? 7 : 8;
      
      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: yPos,
        styles: { 
          fontSize: baseFontSize, 
          cellPadding: numColumns > 8 ? 1.5 : 2,
          textColor: [textRgb.r, textRgb.g, textRgb.b],
          lineColor: [primaryRgb.r * 0.3, primaryRgb.g * 0.3, primaryRgb.b * 0.3],
          lineWidth: 0.1,
          overflow: 'linebreak',
          minCellHeight: numColumns > 8 ? 3 : 4
        },
        headStyles: { 
          fillColor: [primaryRgb.r, primaryRgb.g, primaryRgb.b],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: headerFontSize,
          overflow: 'linebreak',
          cellPadding: numColumns > 8 ? 1.5 : 2
        },
        alternateRowStyles: { 
          fillColor: [backgroundRgb.r, backgroundRgb.g, backgroundRgb.b]
        },
        margin: { left: 14, right: 14 },
        columnStyles: columnStyles,
        theme: 'grid',
        tableWidth: numColumns > 8 ? 'wrap' : 'auto', // Wrap for very wide tables
        showHead: 'everyPage'
      });
      
      yPos = doc.lastAutoTable.finalY + 10;
    }
  });
  
  doc.addPage();
  
  doc.setFillColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 20, 5, 30, 30);
    } catch (error) {
      // Skip
    }
  }
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Export Summary', pageWidth / 2, 25, { align: 'center' });
  
  yPos = 55;
  
  const summaryBoxHeight = dataTypes.filter(dt => dt.data.length > 0).length * 10 + 30;
  doc.setFillColor(backgroundRgb.r, backgroundRgb.g, backgroundRgb.b);
  doc.roundedRect(14, yPos - 5, pageWidth - 28, summaryBoxHeight, 3, 3, 'F');
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
  
  let totalItemsCount = 0;
  dataTypes.forEach(({ label, data: items }) => {
    if (items.length > 0) {
      totalItemsCount += items.length;
      doc.setFillColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
      doc.circle(20, yPos + 1, 2, 'F');
      
      doc.setTextColor(textRgb.r, textRgb.g, textRgb.b);
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 28, yPos + 2);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(textLightRgb.r, textLightRgb.g, textLightRgb.b);
      doc.text(`${items.length} items`, pageWidth - 20, yPos + 2, { align: 'right' });
      yPos += 10;
    }
  });
  
  yPos += 10;
  doc.setDrawColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  doc.setLineWidth(0.5);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 8;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  doc.text(`Total Items: ${totalItemsCount}`, pageWidth / 2, yPos, { align: 'center' });
  
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    doc.setDrawColor(primaryRgb.r * 0.5, primaryRgb.g * 0.5, primaryRgb.b * 0.5);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
    
    doc.setFontSize(7);
    doc.setTextColor(textLightRgb.r, textLightRgb.g, textLightRgb.b);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
    
    doc.setFontSize(6);
    doc.setTextColor(primaryRgb.r, primaryRgb.g, primaryRgb.b);
    doc.text(
      'The Pep Planner - Research Data Management',
      pageWidth / 2,
      pageHeight - 3,
      { align: 'center' }
    );
  }
  
  doc.save(filename);
}

// Format field names for display with proper capitalization
function formatFieldName(field) {
  // Handle common abbreviations and special cases
  const specialCases = {
    'protocolName': 'Protocol Name',
    'orderDate': 'Order Date',
    'shippedDate': 'Shipped Date',
    'deliveredDate': 'Delivered Date',
    'scheduledDate': 'Scheduled Date',
    'startDate': 'Start Date',
    'endDate': 'End Date',
    'targetDate': 'Target Date',
    'reconDate': 'Reconstitution Date',
    'useByDate': 'Use By Date',
    'trackingNumber': 'Tracking Number',
    'publicOrderNumber': 'Public Order Number',
    'shippingCost': 'Shipping Cost',
    'shippingStatus': 'Shipping Status',
    'shippingMethods': 'Shipping Methods',
    'paymentMethods': 'Payment Methods',
    'linkedItems': 'Linked Items',
    'batchNumber': 'Batch Number',
    'capColor': 'Cap Color',
    'penColor': 'Pen Color',
    'deliveryMethod': 'Delivery Method',
    'administrationRoute': 'Administration Route',
    'peptideAmount': 'Peptide Amount',
    'totalVolume': 'Total Volume',
    'bacWater': 'Bac Water',
    'reconItem': 'Reconstitution Item',
    'completionStatus': 'Completion Status',
    'followUpNotes': 'Follow-up Notes',
    'notesCount': 'Notes Count',
    'protocolHistory': 'Protocol History',
    'calendarNotes': 'Calendar Notes',
    'scheduledBuys': 'Scheduled Buys',
    'reconHistory': 'Reconstitution History',
    'reconItems': 'Reconstituted Items',
    'userNotes': 'User Notes',
    'waterTracker': 'Water Tracker',
    'taskCompletion': 'Task Completion',
    'calendarDone': 'Calendar Tasks Done',
    'injectionHistory': 'Injection History',
    'injectionStats': 'Injection Stats',
    'timeSlot': 'Time Slot'
  };
  
  if (specialCases[field]) {
    return specialCases[field];
  }
  
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

// Format frequency for display
function formatFrequency(frequency) {
  if (!frequency) return '';
  if (typeof frequency === 'string') return frequency;
  if (typeof frequency === 'object') {
    const type = frequency.type || 'daily';
    if (type === 'daily') {
      const times = Array.isArray(frequency.time) ? frequency.time.join(', ') : (frequency.time || '');
      return times ? `Daily (${times})` : 'Daily';
    }
    if (type === 'weekly' && frequency.days) {
      const days = Array.isArray(frequency.days) ? frequency.days.join(', ') : frequency.days;
      return `Weekly (${days})`;
    }
    if (type === 'cycle') {
      const cycleStr = `Cycle: ${frequency.onDays || '-'} on / ${frequency.offDays || '-'} off`;
      const timeStr = frequency.time && Array.isArray(frequency.time) && frequency.time.length > 0 ? ` ${frequency.time.join('/')}` : '';
      return cycleStr + timeStr;
    }
    if (type === 'custom') {
      return frequency.customDays ? `Every ${frequency.customDays} days` : 'Custom';
    }
    return type;
  }
  return String(frequency);
}

// Format dosage for display
function formatDosage(dosage) {
  if (!dosage) return '';
  if (typeof dosage === 'string') return dosage;
  if (typeof dosage === 'number') return String(dosage);
  if (typeof dosage === 'object') {
    if (dosage.amount !== undefined && dosage.amount !== null && dosage.unit) {
      return `${dosage.amount} ${dosage.unit}`;
    }
    if (dosage.amount !== undefined && dosage.amount !== null) {
      return String(dosage.amount);
    }
    return '';
  }
  return String(dosage);
}

// Format peptides array for user-friendly display
function formatPeptides(peptides) {
  if (!peptides || !Array.isArray(peptides) || peptides.length === 0) return '';
  
  return peptides.map(pep => {
    const parts = [];
    
    // Peptide name
    if (pep.name) {
      parts.push(pep.name.trim());
    }
    
    // Dosage
    if (pep.dosage) {
      const dosageStr = formatDosage(pep.dosage);
      if (dosageStr) parts.push(dosageStr);
    }
    
    // Frequency
    if (pep.frequency) {
      const freqStr = formatFrequency(pep.frequency);
      if (freqStr) parts.push(freqStr);
    }
    
    // Delivery method
    if (pep.deliveryMethod) {
      parts.push(pep.deliveryMethod);
    }
    
    return parts.join(' • ');
  }).join(' | ');
}

// Format values for display
function formatValue(value, forPDF = false, fieldName = '') {
  if (value == null || value === undefined) return '';
  
  // Handle booleans first
  if (typeof value === 'boolean') {
    return formatBoolean(value);
  }
  
  // Special handling for duration field
  if (fieldName === 'duration') {
    return formatDuration(value);
  }
  
  // Special handling for washout field
  if (fieldName === 'washout') {
    return formatWashout(value);
  }

  // Special handling for linkedItems field - already formatted as string by formatProtocolLinkedItems
  if (fieldName === 'linkedItems' && typeof value === 'string') {
    return value; // Already formatted by formatProtocolLinkedItems
  }
  
  // Special handling for peptides field - format as user-friendly list
  if (fieldName === 'peptides') {
    return formatPeptides(value);
  }
  
  // Special handling for frequency field
  if (fieldName === 'frequency') {
    return formatFrequency(value);
  }
  
  // Special handling for dosage field
  if (fieldName === 'dosage') {
    return formatDosage(value);
  }
  
  // Special handling for status/active fields
  if (fieldName === 'status' || fieldName === 'active') {
    if (typeof value === 'boolean') {
      return formatBoolean(value);
    }
    if (value === 'active' || value === 'Active') return 'Active';
    if (value === 'inactive' || value === 'Inactive') return 'Inactive';
    if (value === 'completed' || value === 'Completed') return 'Completed';
    if (value === 'cancelled' || value === 'Cancelled') return 'Cancelled';
    if (value === 'delivered' || value === 'Delivered') return 'Delivered';
    if (value === 'shipped' || value === 'Shipped') return 'Shipped';
    if (value === 'orderPlaced' || value === 'Order Placed') return 'Order Placed';
    // Capitalize first letter of status
    return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
  }
  
  // Special handling for completionStatus
  if (fieldName === 'completionStatus') {
    if (value === 'completed') return 'Completed';
    if (value === 'active') return 'Active';
    if (value === 'cancelled') return 'Cancelled';
    return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
  }
  
  // Format dates consistently - handle both date strings and Date objects
  if (fieldName.toLowerCase().includes('date') && value) {
    try {
      let date;
      if (value instanceof Date) {
        date = value;
      } else if (typeof value === 'string') {
        // Handle ISO timestamps and date strings
        date = new Date(value);
      } else {
        return String(value);
      }
      
      if (!isNaN(date.getTime())) {
        // Format as "Jan 12, 2026" for readability
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }
    } catch (e) {
      // If date parsing fails, return as is
    }
  }
  
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      // Special handling for arrays of objects (like notes in protocol history)
      if (value.length > 0 && typeof value[0] === 'object' && value[0].content) {
        // Protocol history notes
        return value.map(note => note.content || '').filter(Boolean).join(forPDF ? ' | ' : '; ');
      }
      // For simple arrays (strings, numbers), just join them
      if (value.length > 0 && (typeof value[0] === 'string' || typeof value[0] === 'number')) {
        return value.join(forPDF ? ', ' : ', ');
      }
      // For arrays of objects, format each item nicely
      return value.map(item => {
        if (typeof item === 'boolean') return formatBoolean(item);
        if (typeof item === 'object' && item !== null) {
          // Check if it's a duration or washout object
          if (item.count && item.unit) {
            const count = item.count;
            const unit = String(item.unit).toLowerCase();
            return `${count} ${unit}${count !== '1' ? 's' : ''}`;
          }
          // For other objects, try to format nicely - show only key user-facing info
          const readable = [];
          if (item.name) readable.push(item.name);
          if (item.title) readable.push(item.title);
          if (item.term) readable.push(item.term);
          if (item.amount !== undefined && item.unit) readable.push(`${item.amount} ${item.unit}`);
          if (item.type && !['id', '_id'].includes(item.type.toLowerCase())) readable.push(item.type);
          // For vials, show peptide name if available
          if (item.peptide) readable.push(item.peptide);
          return readable.length > 0 ? readable.join(' • ') : '';
        }
        return String(item);
      }).join(forPDF ? ' | ' : '; ');
    }
    if (value instanceof Date) {
      return value.toLocaleDateString();
    }
    // For objects, try to make them readable - but skip technical fields
    const pairs = Object.entries(value)
      .filter(([k, v]) => {
        // Filter out excluded fields
        if (EXCLUDED_FIELDS.includes(k.toLowerCase())) return false;
        if (shouldExcludeField(k)) return false;
        // Filter out technical/internal fields
        if (['id', '_id', 'uid', 'userId', 'createdAt', 'updatedAt', 'timestamp', 'serverTimestamp'].includes(k.toLowerCase())) return false;
        return v != null;
      })
      .map(([k, v]) => {
        if (k === 'duration') return formatDuration(v);
        if (k === 'washout') return formatWashout(v);
        if (k === 'frequency') return formatFrequency(v);
        if (k === 'dosage') return formatDosage(v);
        if (typeof v === 'boolean') return `${k}: ${formatBoolean(v)}`;
        if (typeof v === 'object' && !Array.isArray(v)) {
          // For nested objects, just show key info
          if (v.name) return `${k}: ${v.name}`;
          if (v.amount && v.unit) return `${k}: ${v.amount} ${v.unit}`;
          return ''; // Skip complex nested objects
        }
        return `${k}: ${v}`;
      })
      .filter(Boolean) // Remove empty strings
      .join(forPDF ? '; ' : ', ');
    return pairs || '';
  }
  
  return String(value);
}

// Legacy function for backward compatibility
export function exportToCSV(rows, filename = 'export.csv') {
  if (!Array.isArray(rows) || rows.length === 0) {
    const blob = new Blob(['No data to export'], { type: 'text/csv' })
    downloadBlob(blob, filename)
    return
  }
  
  // Get all unique headers from all rows
  const allHeaders = new Set()
  rows.forEach(row => {
    Object.keys(row).forEach(key => allHeaders.add(key))
  })
  const headers = Array.from(allHeaders).sort()
  
  const csvLines = []
  
  // Add BOM for proper UTF-8 encoding in Excel
  csvLines.push('\uFEFF')
  
  // Add headers
  csvLines.push(headers.join(','))
  
  // Add data rows
  for (const row of rows) {
    const values = headers.map((h) => csvEscape(flattenValue(row[h])))
    csvLines.push(values.join(','))
  }
  
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, filename)
}

function csvEscape(value) {
  if (value == null || value === undefined) return ''
  let s = String(value)
  if (s.includes('"')) s = s.replace(/"/g, '""')
  if (/[",\n\r]/.test(s)) s = `"${s}"`
  return s
}

function flattenValue(value) {
  if (value == null || value === undefined) return ''
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map(item => 
        typeof item === 'object' ? JSON.stringify(item) : String(item)
      ).join('; ')
    }
    return JSON.stringify(value)
  }
  return String(value)
}

 function downloadBlob(blob, filename) {
   const url = URL.createObjectURL(blob)
   const a = document.createElement('a')
   a.href = url
   a.download = filename
   document.body.appendChild(a)
   a.click()
   a.remove()
   URL.revokeObjectURL(url)
 }
