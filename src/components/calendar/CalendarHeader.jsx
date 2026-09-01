import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { SealQuestion } from '@phosphor-icons/react';
import ModernTooltip from '../ui/ModernTooltip';

const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

export default function CalendarHeader({ currentDate, weekStart, onPrev, onNext, onToday, viewMode, onChangeView, onShowIconKey, theme }) {
  const [timeOfDay, setTimeOfDay] = useState(getTimeOfDay());
  
  // Update time of day every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOfDay(getTimeOfDay());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const today = new Date();
  const isToday = currentDate.toDateString() === today.toDateString();
  
  // Format for modern clock display
  const dayName = currentDate.toLocaleString('default', { weekday: 'long' }).toUpperCase();
  const dayNumber = currentDate.getDate();
  const monthAbbr = currentDate.toLocaleString('default', { month: 'short' }).toUpperCase();
  
  return (
    <div className="flex flex-col items-center mb-2 flex-shrink-0">
      {/* Modern Clock-Style Date Display with Navigation Arrows */}
      <div className="flex items-center gap-2 w-full max-w-md justify-center">
        {/* Previous Button */}
        <button
          onClick={onPrev}
          className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
          style={{ 
            color: theme.isDark ? theme.textLight : theme.primaryDark,
            backgroundColor: theme.isDark ? 'rgba(31, 41, 55, 0.3)' : 'rgba(255, 255, 255, 0.4)',
            border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
          }}
        >
          <ChevronLeft size={18} />
        </button>

        {/* Date Display Card */}
        <div 
          className="flex flex-col items-center justify-center py-2 px-4 rounded-xl flex-1 max-w-xs relative"
          style={{ 
            backgroundColor: theme.isDark ? 'rgba(31, 41, 55, 0.3)' : 'rgba(255, 255, 255, 0.4)',
            border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
            boxShadow: theme.isDark ? '0 1px 3px rgba(0, 0, 0, 0.3)' : '0 1px 2px rgba(0, 0, 0, 0.05)'
          }}
        >
          {/* Day Name - LARGER & BOLDER */}
          <div 
            className="text-2xl font-extrabold tracking-wider"
            style={{ 
              color: theme.isDark ? theme.text : theme.primaryDark,
              textShadow: isToday ? `0 0 20px ${theme.primary}40` : 'none'
            }}
          >
            {dayName}
          </div>
          
          {/* Time of Day - COLORED & SLIGHTLY LARGER */}
          <div 
            className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ 
              color: isToday ? theme.primary : theme.textLight,
              opacity: isToday ? 0.9 : 0.6
            }}
          >
            {isToday ? timeOfDay : '\u00A0'}
          </div>
          
          {/* Date Display - ADJUSTED SIZE & BETTER SEPARATOR */}
          <div 
            className="text-xl font-bold mt-0.5 tracking-wide"
            style={{ 
              color: theme.isDark ? theme.text : theme.primaryDark
            }}
          >
            {dayNumber} <span className="opacity-50 mx-1">|</span> {monthAbbr}
          </div>
        </div>

        {/* Next Button */}
        <button
          onClick={onNext}
          className="p-1.5 rounded-lg transition-all hover:scale-110 active:scale-95"
          style={{ 
            color: theme.isDark ? theme.textLight : theme.primaryDark,
            backgroundColor: theme.isDark ? 'rgba(31, 41, 55, 0.3)' : 'rgba(255, 255, 255, 0.4)',
            border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
          }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Modern Unified Glassmorphism Controls */}
      <div className="relative flex items-center justify-center w-full mt-2">
        <div 
          className="flex items-center p-1.5 rounded-2xl backdrop-blur-md"
          style={{ 
            backgroundColor: theme.isDark ? 'rgba(31, 41, 55, 0.4)' : 'rgba(255, 255, 255, 0.7)',
            border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}`,
            boxShadow: theme.isDark ? '0 8px 32px rgba(0, 0, 0, 0.4)' : '0 8px 32px rgba(31, 38, 135, 0.07)'
          }}
        >
          {/* Today Button - Integrated Action */}
          <button 
            onClick={onToday}
            className="relative px-5 py-2 text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-300 rounded-xl overflow-hidden group"
            style={{
              color: isToday ? theme.textOnPrimary : (theme.isDark ? theme.text : theme.primaryDark),
              backgroundColor: isToday ? theme.primary : 'transparent',
              boxShadow: isToday ? `0 4px 15px ${theme.primary}60` : 'none'
            }}
          >
            {isToday && (
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-20 translate-x-[-100%] animate-[shimmer_2s_infinite]"></span>
            )}
            <span className="relative z-10">Today</span>
          </button>

          {/* Minimal Aesthetic Divider */}
          <div className="w-px h-4 mx-2 opacity-20" style={{ backgroundColor: theme.textLight }}></div>

          {/* View Mode Segmented Control */}
          <div className="flex gap-1">
            <button 
              onClick={() => onChangeView('month')}
              className="px-5 py-2 text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-300 rounded-xl"
              style={{
                backgroundColor: viewMode === 'month' ? theme.primary : 'transparent',
                color: viewMode === 'month' ? theme.textOnPrimary : (theme.isDark ? theme.textLight : '#6b7280'),
                boxShadow: viewMode === 'month' ? `0 4px 15px ${theme.primary}60` : 'none',
                opacity: viewMode === 'month' ? 1 : 0.6
              }}
            >
              Month
            </button>
            <button 
              onClick={() => onChangeView('week')}
              className="px-5 py-2 text-[11px] font-bold uppercase tracking-[0.15em] transition-all duration-300 rounded-xl"
              style={{
                backgroundColor: viewMode === 'week' ? theme.primary : 'transparent',
                color: viewMode === 'week' ? theme.textOnPrimary : (theme.isDark ? theme.textLight : '#6b7280'),
                boxShadow: viewMode === 'week' ? `0 4px 15px ${theme.primary}60` : 'none',
                opacity: viewMode === 'week' ? 1 : 0.6
              }}
            >
              Week
            </button>
          </div>
        </div>

        {/* Info Button - Positioned Absolutely Right */}
        {viewMode === 'month' && onShowIconKey && (
          <button 
            onClick={onShowIconKey}
            className="absolute right-2 p-2 rounded-full active:scale-90 hover:opacity-100 transition-opacity"
            style={{
              color: theme.primary,
              opacity: 0.7
            }}
          >
            <SealQuestion size={24} weight="duotone" color={theme.primary} aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}


