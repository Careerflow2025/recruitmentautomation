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
        right: -10, // Position at the column border (account for 8px padding + border)
        width: 6,
        height: '100%',
        cursor: 'col-resize',
        zIndex: 100,
        backgroundColor: isHovering || isResizing ? 'rgba(255, 255, 255, 0.8)' : 'transparent',
        transition: 'background-color 0.15s ease',
        borderRight: isHovering || isResizing ? '2px solid rgba(59, 130, 246, 0.8)' : 'none',
      }}
      title="Drag to resize column"
    />
  );
}
