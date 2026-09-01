import React from 'react';
import { Pill, ShoppingCart, CheckCircle, Syringe, FileText, Heartbeat } from '@phosphor-icons/react';
import { areGroupBuysEnabled } from '../../utils/featureSettings';

export default function CalendarIconKey({ theme, isVisible, onClose }) {
    if (!isVisible) return null;

    const iconColor = theme.isDark ? '#a8b5a0' : '#73796D';
    const sideFxAccent = theme.primaryDark || theme.primary || '#5F7F76';
    const groupBuysEnabled = areGroupBuysEnabled();

    const iconItems = [
        {
            icon: (
                <CheckCircle
                    size={24}
                    weight="fill"
                    style={{ color: '#4CAF50' }}
                />
            ),
            label: 'All Research Completed',
            description: 'Research is done marked as completed for the day.'
        },
        {
            icon: <Syringe size={24} weight="duotone" style={{ color: iconColor }} />,
            label: 'Peptides & Research',
            description: 'Scheduled Peptide & Research'
        },
        {
            icon: <Pill size={24} weight="duotone" style={{ color: iconColor }} />,
            label: 'Supplements',
            description: 'Scheduled supplements or medications'
        },
        ...(groupBuysEnabled
            ? [{
                icon: <ShoppingCart size={16} weight="duotone" style={{ color: iconColor }} />,
                label: 'Orders & Buys',
                description: 'Scheduled purchases or group buys'
            }]
            : []),
        {
            icon: <Heartbeat size={24} weight="duotone" style={{ color: sideFxAccent }} />,
            label: 'Side Effects',
            description: 'Side effects were logged for this day'
        },
        {
            icon: <FileText size={24} weight="duotone" style={{ color: iconColor }} />,
            label: 'Day Note',
            description: 'A note has been saved for this day'
        }
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto" style={{ backgroundColor: theme.cardBackground }}>
                <div className="p-4 border-b" style={{ borderColor: theme.border }}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold" style={{ color: theme.primaryDark }}>
                            Calendar Icon Guide
                        </h2>
                        <button 
                            onClick={onClose}
                            className="p-1 rounded-full hover:opacity-70"
                            style={{ color: theme.textLight }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <div className="p-4 space-y-3">
                    {iconItems.map((item, index) => (
                        <div key={index} className="flex items-start gap-3 p-2 rounded-lg hover:opacity-90" style={{ backgroundColor: theme.background }}>
                            <div className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded" style={{ 
                                backgroundColor: theme.primary + '10',
                                color: theme.primary 
                            }}>
                                {item.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm" style={{ color: theme.primaryDark }}>
                                    {item.label}
                                </div>
                                <div className="text-xs mt-0.5" style={{ color: theme.textLight }}>
                                    {item.description}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
