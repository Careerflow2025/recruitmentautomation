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
        right: -13, // Position at the column border (.rdg-cell has 12px right padding, +1px to center on border)
        width: 8,
        height: '100%',
        cursor: 'col-resize',
        zIndex: 1000,
        backgroundColor: isHovering || isResizing ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
        transition: 'background-color 0.15s ease',
        boxShadow: isHovering || isResizing ? '0 0 8px rgba(59, 130, 246, 0.6)' : 'none',
      }}
      title="Drag to resize column"
    />
  );
}
