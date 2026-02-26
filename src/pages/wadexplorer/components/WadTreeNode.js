import React from 'react';
import {
  ChevronRight, ChevronDown, Folder, FolderOpen,
  FileText, Music, Image, Box, Layers, Cpu, File,
} from 'lucide-react';
import * as S from '../styles.js';

const COMPRESSION_LABELS = ['Raw', 'Gzip', 'Sat', 'Zstd', 'ZstdC'];
const COMPRESSION_COLORS = [
  'rgba(255,255,255,0.3)',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
];

function getFileIcon(extension, name) {
  const ext = (extension || name?.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'ogg': case 'wav': case 'mp3': case 'wem':
      return <Music size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />;
    case 'dds': case 'png': case 'jpg': case 'tga': case 'tex':
      return <Image size={13} style={{ color: '#06b6d4', flexShrink: 0 }} />;
    case 'skn': case 'skl': case 'scb': case 'sco': case 'scw':
      return <Box size={13} style={{ color: '#8b5cf6', flexShrink: 0 }} />;
    case 'anm':
      return <Layers size={13} style={{ color: '#10b981', flexShrink: 0 }} />;
    case 'bin': case 'inibin':
      return <Cpu size={13} style={{ color: '#f97316', flexShrink: 0 }} />;
    case 'luaobj': case 'lua':
      return <FileText size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />;
    default:
      return <File size={13} style={{ opacity: 0.45, flexShrink: 0 }} />;
  }
}

function formatBytes(b) {
  if (!b) return '';
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024)    return (b / 1024).toFixed(0) + ' KB';
  return b + ' B';
}

export default function WadTreeNode({ node, isExpanded, isSelected, onToggle, onSelect, style }) {
  const indent = node.depth * 16;
  const isDir = node.type === 'dir';

  const handleClick = () => {
    if (isDir && node.hasChildren) onToggle(node.path);
    onSelect(node);
  };

  const compressionColor = !isDir && node.compressionType != null
    ? COMPRESSION_COLORS[node.compressionType] || COMPRESSION_COLORS[0]
    : null;

  return (
    <div
      style={{
        ...style,
        ...S.treeRow,
        paddingLeft: 8 + indent,
        background: isSelected
          ? 'rgba(var(--accent-rgb, 120,80,255), 0.15)'
          : 'transparent',
        color: isSelected ? 'var(--accent)' : 'var(--text)',
      }}
      onClick={handleClick}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'rgba(var(--accent-rgb,120,80,255),0.15)' : 'transparent'; }}
      title={node.path}
    >
      {/* Expand chevron for dirs */}
      {isDir ? (
        node.hasChildren
          ? (isExpanded
            ? <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.6 }} />
            : <ChevronRight size={13} style={{ flexShrink: 0, opacity: 0.6 }} />)
          : <span style={{ width: 13, flexShrink: 0 }} />
      ) : (
        <span style={{ width: 13, flexShrink: 0 }} />
      )}

      {/* Icon */}
      {isDir
        ? (isExpanded
          ? <FolderOpen size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
          : <Folder size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />)
        : getFileIcon(node.extension, node.name)
      }

      {/* Name */}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
        {node.name}
      </span>

      {/* File metadata */}
      {!isDir && (
        <>
          {node.decompressedSize > 0 && (
            <span style={{ ...S.badge, color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>
              {formatBytes(node.decompressedSize)}
            </span>
          )}
          {node.compressionType != null && (
            <span style={{ ...S.badge, color: compressionColor, fontSize: 10 }}>
              {COMPRESSION_LABELS[node.compressionType] ?? `t${node.compressionType}`}
            </span>
          )}
        </>
      )}

      {/* Dir child count badge */}
      {isDir && node.hasChildren && (
        <span style={{ ...S.badge, fontSize: 10 }}>
          {node.children?.length ?? ''}
        </span>
      )}
    </div>
  );
}
