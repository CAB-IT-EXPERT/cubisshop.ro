import React from 'react';
import { Image, View } from 'react-native';
import type { ShopProductImage } from '@/services/shopApi';
import { Theme } from '@/constants/colors';

export default function ShopProductPicture({ image, width, height, borderRadius = 0 }: {
  image: ShopProductImage & { preview_uri?: string };
  width: number;
  height: number;
  borderRadius?: number;
}) {
  const uri = image.preview_uri || image.url || '';
  const spriteIndex = Number(image.sprite_index || 0);
  if (!spriteIndex) return <Image source={{ uri }} style={{ width, height, borderRadius, backgroundColor: Theme.colors.surface.muted }} />;

  const cellSize = Math.max(width, height);
  const column = (spriteIndex - 1) % 3;
  const row = Math.floor((spriteIndex - 1) / 3);
  return (
    <View style={{ width, height, borderRadius, overflow: 'hidden', backgroundColor: Theme.colors.surface.muted }}>
      <Image
        source={{ uri }}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: cellSize * 3,
          height: cellSize * 2,
          left: -(column * cellSize) - ((cellSize - width) / 2),
          top: -(row * cellSize) - ((cellSize - height) / 2),
        }}
      />
    </View>
  );
}
