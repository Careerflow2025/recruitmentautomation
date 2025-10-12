'use client';

import { useRef, useState, useEffect } from 'react';

interface ColumnResizeHandleProps {
  columnIndex: number;
  onResize: (columnIndex: number, newWidth: number) => void;
  currentWidth: number;
}

export default function ColumnResizeHandle({
  columnIndex,
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
      onResize(columnIndex, newWidth);
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
  }, [isResizing, columnIndex, onResize]);

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
        right: -3, // Center on the 1px border (-3px to 1px = 4px centered on border)
        width: 4,
        height: '100%',
        cursor: 'col-resize',
        zIndex: 20,
        backgroundColor: isHovering || isResizing ? 'rgba(59, 130, 246, 0.3)' : 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      title="Drag to resize column"
    />
  );
}
