import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_RENDER_CONFIG, type RenderConfig } from "@ai-diagram-studio/shared";

const RenderConfigContext = createContext<RenderConfig>(DEFAULT_RENDER_CONFIG);

export function RenderConfigProvider({
  config,
  children
}: {
  config: RenderConfig;
  children: ReactNode;
}) {
  return (
    <RenderConfigContext.Provider value={config}>
      {children}
    </RenderConfigContext.Provider>
  );
}

export function useRenderConfig(): RenderConfig {
  return useContext(RenderConfigContext);
}
