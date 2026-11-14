// Types for the vendored @ironcalc/workbook bundle (only what this app uses).
import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { InitInput, Model } from "@ironcalc/wasm-xlsx";

export type IronCalcThemeVariables = Record<`--${string}`, string>;

export interface IronCalcProperties {
  model: Model;
  themeVariables?: Partial<IronCalcThemeVariables>;
  /** Element that gets the `ic-root` class and the theme variables; menus portal into it. Defaults to document.body. */
  rootContainer?: HTMLElement | null;
  /** When false, renders without the toolbar, the formula bar is read-only and all edits are blocked. */
  canEdit?: boolean;
}

export interface IronCalcHandle {
  setLanguage: (language: string) => void;
}

export declare const IronCalc: ForwardRefExoticComponent<IronCalcProperties & RefAttributes<IronCalcHandle>>;
export declare const darkThemeVariables: IronCalcThemeVariables;
/** Initialises the wasm engine and the widget's translations. */
export declare function init(module?: { module_or_path: InitInput | Promise<InitInput> } | InitInput): Promise<void>;
export { Model };
