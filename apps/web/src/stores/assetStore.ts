import { create } from "zustand";

type AssetRecord = {
  id: string;
  assetType: string;
  filename: string;
};

type AssetState = {
  assets: AssetRecord[];
  selectedAssetId: string | null;
  chunks: Array<{ id: string; title: string | null; content: string }>;
  setAssets: (assets: AssetRecord[]) => void;
  addAsset: (asset: AssetRecord) => void;
  setSelectedAssetId: (assetId: string | null) => void;
  setChunks: (chunks: Array<{ id: string; title: string | null; content: string }>) => void;
};

export const useAssetStore = create<AssetState>((set) => ({
  assets: [],
  selectedAssetId: null,
  chunks: [],
  setAssets: (assets) => set({ assets }),
  addAsset: (asset) =>
    set((state) => ({
      assets: [asset, ...state.assets],
      selectedAssetId: asset.id
    })),
  setSelectedAssetId: (assetId) => set({ selectedAssetId: assetId }),
  setChunks: (chunks) => set({ chunks })
}));
