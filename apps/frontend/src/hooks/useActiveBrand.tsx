import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useBrands } from "@/hooks/useBrand";
import type { Brand } from "@covable/shared";

const STORAGE_KEY = "covable_brand_id";

interface ActiveBrandContextValue {
  activeBrand: Brand | undefined;
  activeBrandId: string | undefined;
  brands: Brand[];
  isLoading: boolean;
  setActiveBrandId: (id: string) => void;
}

const ActiveBrandContext = createContext<ActiveBrandContextValue | null>(null);

export function ActiveBrandProvider({ children }: { children: ReactNode }) {
  const { data: brands, isLoading } = useBrands();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY)
  );

  // If stored ID doesn't match any brand, fall back to first
  const activeBrand =
    brands?.find((b) => b.id === selectedId) ?? brands?.[0];

  // Keep localStorage in sync
  useEffect(() => {
    if (activeBrand?.id && activeBrand.id !== selectedId) {
      setSelectedId(activeBrand.id);
      localStorage.setItem(STORAGE_KEY, activeBrand.id);
    }
  }, [activeBrand?.id]);

  function setActiveBrandId(id: string) {
    setSelectedId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }

  return (
    <ActiveBrandContext.Provider
      value={{
        activeBrand,
        activeBrandId: activeBrand?.id,
        brands: brands ?? [],
        isLoading,
        setActiveBrandId,
      }}
    >
      {children}
    </ActiveBrandContext.Provider>
  );
}

export function useActiveBrand() {
  const ctx = useContext(ActiveBrandContext);
  if (!ctx) throw new Error("useActiveBrand must be used within ActiveBrandProvider");
  return ctx;
}
