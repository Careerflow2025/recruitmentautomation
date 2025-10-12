'use client';

import { useRef, useState, useEffect } from 'react';

interface ColumnResizeHandleProps {
  columnKey: string;
  onResize: (columnKey: string, newWidth: number) => void;
  currentWidth: number;
}

export default function ColumnResizeHandle({
  columnKey,
  onResize,
  currentWidth,
}: ColumnResizeHandleProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(80, startWidthRef.current + delta); // Min width 80px
      onResize(columnKey, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, columnKey, onResize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{
        position: 'absolute',
        top: 0,
        right: '-4px', // Position exactly on column border (half of width outside)
        width: '8px', // Wider clickable area
        height: '100%', // Full height of header cell
        cursor: 'col-resize',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title="Drag to resize column"
    >
      <div 
        style={{
          width: '2px', // Visual indicator is a thin line
          height: '70%', // Slightly shorter than full height
          backgroundColor: isHovering || isResizing ? '#3b82f6' : 'rgba(255, 255, 255, 0.3)',
          transition: 'background-color 0.15s ease',
          boxShadow: isHovering || isResizing ? '0 0 8px rgba(59, 130, 246, 0.8)' : 'none',
          borderRadius: '1px',
        }}
      />
    </div>
  );
}
