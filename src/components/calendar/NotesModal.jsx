import React, { useState, useEffect, useMemo } from 'react'
import BottomSheet from '../common/BottomSheet'
import { formatMMDDYYYY } from '../../utils/date'

export default function NotesModal({ open, onClose, theme, notes, onSave, onDelete, date }) {
    const title = useMemo(() => {
        if (!date) return 'Research Notes'
        const formatted = formatMMDDYYYY(date)
        return formatted ? `Research Notes for ${formatted}` : 'Research Notes'
    }, [date])
    const [text, setText] = useState('')
    const [confirmDelete, setConfirmDelete] = useState(false)
    const hasExistingNote = Boolean((notes || '').trim())

    useEffect(() => {
        if (open) {
            setText(notes || '')
            setConfirmDelete(false)
        }
    }, [open, notes])

    const handleSave = () => {
        onSave(text)
        onClose()
    }

    const handleDelete = () => {
        if (confirmDelete) {
            onDelete?.()
            setConfirmDelete(false)
            onClose()
        } else {
            setConfirmDelete(true)
        }
    }

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={title}
            theme={theme}
            fitContent
            seamlessContent={false}
        >
            <div className="px-4 pb-4 pt-2 space-y-3">
                <textarea
                    rows={4}
                    className="w-full px-3.5 py-3 rounded-xl border transition-all duration-200 resize-none focus:outline-none text-sm"
                    style={{
                        borderColor: theme.border,
                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.secondary,
                        color: theme.text,
                    }}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="How did you feel today? Any side effects, dose changes, observations…"
                    autoFocus
                    onFocus={(e) => {
                        e.currentTarget.style.borderColor = theme.primary;
                        e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.primary}20`;
                    }}
                    onBlur={(e) => {
                        e.currentTarget.style.borderColor = theme.border;
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                />
                <div className={`flex items-center gap-3 w-full ${hasExistingNote ? 'justify-between' : 'justify-end'}`}>
                    {hasExistingNote ? (
                        <button
                            type="button"
                            onClick={handleDelete}
                            className={`py-2 text-sm font-medium transition-all touch-manipulation underline-offset-2 hover:underline ${confirmDelete ? 'tap-confirm-pop underline' : ''}`}
                            style={{ color: confirmDelete ? '#8B5335' : '#C67A5C' }}
                        >
                            {confirmDelete ? 'Tap again to confirm' : 'Delete'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={handleSave}
                        className="shrink-0 px-6 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98]"
                        style={{ backgroundColor: theme.primary, boxShadow: `0 2px 8px ${theme.primary}40` }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </BottomSheet>
    )
}
