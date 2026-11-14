import React from 'react';

export function Feather({
  name,
  size = 16,
  color,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return (
    <span
      data-feather={name}
      aria-hidden="true"
      style={{ display: 'inline-block', width: size, height: size, flexShrink: 0, color }}
    />
  );
}
