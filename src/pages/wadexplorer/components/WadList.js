import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import * as S from '../styles.js';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576)    return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024)       return (bytes / 1024).toFixed(0) + ' KB';
  return bytes + ' B';
}

export default function WadList({ groups, selectedWad, onSelect }) {
  const [collapsed, setCollapsed] = useState({});

  if (!groups || Object.keys(groups).length === 0) {
    return (
      <div style={{ ...S.emptyState, flex: 1 }}>
        <span style={{ opacity: 0.4, fontSize: 12 }}>No WADs found</span>
        <span style={{ opacity: 0.3, fontSize: 11 }}>Pick a Game folder above</span>
      </div>
    );
  }

  const toggleGroup = (key) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  // Sort group names: Champions first, then alphabetical
  const groupKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'Champions') return -1;
    if (b === 'Champions') return 1;
    return a.localeCompare(b);
  });

  return (
    <div style={S.wadList}>
      {groupKeys.map(key => {
        const items = groups[key];
        if (!items || items.length === 0) return null;
        const open = !collapsed[key];

        return (
          <div key={key}>
            <div
              style={S.groupHeader}
              onClick={() => toggleGroup(key)}
            >
              {open
                ? <ChevronDown size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
                : <ChevronRight size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
              }
              <Folder size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
              {key}
              <span style={{ ...S.badge, marginLeft: 'auto' }}>{items.length}</span>
            </div>

            {open && items.map((entry) => {
              const isSelected = selectedWad?.path === entry.path;
              const displayName = entry.name.replace(/\.wad\.client$/i, '');
              return (
                <div
                  key={entry.path}
                  style={{
                    ...S.wadRow,
                    background: isSelected ? 'rgba(120,80,255,0.18)' : 'transparent',
                    color: isSelected ? 'var(--accent)' : entry.isVoiceover ? 'var(--text-2)' : 'var(--text)',
                    fontStyle: entry.isVoiceover ? 'italic' : 'normal',
                  }}
                  onClick={() => onSelect(entry)}
                  title={entry.path}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(120,80,255,0.18)' : 'transparent'; }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </span>
                  {entry.size > 0 && (
                    <span style={{ ...S.badge, flexShrink: 0 }}>{formatSize(entry.size)}</span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
