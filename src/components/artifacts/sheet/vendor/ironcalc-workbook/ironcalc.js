// @ironcalc/workbook 0.9.1, vendored by update.sh (MIT OR Apache-2.0, see LICENSE-MIT / LICENSE-Apache-2.0).
// Patched: engine import -> @ironcalc/wasm-xlsx; lucide LineStyle -> local icon; grid focus only when focus is in the widget. Do not edit by hand.
// @ts-nocheck
import e, { BorderStyle as t, BorderType as n, Model as r, columnNameFromNumber as i, columnNumberFromName as a, getAllTimezones as o, getSupportedLocales as s, getThemeList as c, getTokens as l, hexWithTintToRgb as u, quoteName as d } from "@ironcalc/wasm-xlsx";
import f, { Fragment as p, cloneElement as m, createContext as h, forwardRef as g, useCallback as _, useContext as v, useEffect as y, useId as b, useImperativeHandle as x, useLayoutEffect as S, useMemo as C, useRef as w, useState as T } from "react";
import { I18nextProvider as E, useTranslation as D } from "react-i18next";
import { AlignCenter as O, AlignCenterHorizontal as k, AlignLeft as A, AlignRight as j, ArrowDown as M, ArrowDownRight as N, ArrowDownToLine as ee, ArrowLeft as P, ArrowRight as F, ArrowUp as I, ArrowUpRight as te, ArrowUpToLine as ne, Bold as re, Brush as ie, Check as L, ChevronDown as R, ChevronLeft as ae, ChevronRight as oe, ChevronUp as se, Circle as ce, CircleAlert as le, Clipboard as z, Columns3 as B, Copy as V, DecimalsArrowLeft as ue, DecimalsArrowRight as de, Diamond as fe, DollarSign as pe, Euro as H, Eye as me, EyeOff as he, Flag as U, Globe as ge, Grid2X2 as _e, Grid2x2Check as ve, Grid2x2X as ye, Heart as be, ImageDown as xe, Italic as Se, Layers as Ce, Link2 as Te, Link2Off as Ee, Menu as De, Minus as Oe, MoveHorizontal as ke, MoveVertical as Ae, PackageOpen as je, PaintBucket as Me, PaintRoller as Ne, PencilLine as Pe, Percent as Fe, Plus as Ie, PoundSterling as Le, Redo2 as Re, RemoveFormatting as ze, Rows3 as Be, Scissors as Ve, Search as He, SearchX as Ue, Settings as We, Settings2 as Ge, Snowflake as Ke, SquareMousePointer as qe, Star as Je, Strikethrough as Ye, SwatchBook as Xe, TableCellsMerge as Ze, TableCellsSplit as Qe, Tag as $e, TextCursorInput as et, ThumbsDown as tt, ThumbsUp as nt, Trash2 as rt, Triangle as it, Type as at, Underline as ot, Undo2 as st, WrapText as ct, X as lt } from "lucide-react";
import { Fragment as W, jsx as G, jsxs as K } from "react/jsx-runtime";
const we = (p) => G("svg", { xmlns: "http://www.w3.org/2000/svg", width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", ...p, children: [G("path", { d: "M11 5h10" }), G("path", { d: "M11 12h10", strokeWidth: 3 }), G("path", { d: "M11 19h10", strokeDasharray: "2 3" }), G("path", { d: "M3 5h4" }), G("path", { d: "M3 12h4", strokeWidth: 3 }), G("path", { d: "M3 19h4", strokeDasharray: "2 3" })] });
import { createPortal as ut, flushSync as dt } from "react-dom";
import ft from "i18next";
//#region src/components/clipboard.ts
var pt = () => (/* @__PURE__ */ new Date()).toISOString(), mt = "IronCalc-Clipboard", ht = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [/* @__PURE__ */ K("g", {
		id: "arrow-middle-from-line",
		clipPath: "url(#clip0_107_4135)",
		children: [
			/* @__PURE__ */ G("path", {
				id: "Vector",
				d: "M8 14.6667V10.6667",
				stroke: "currentColor",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ G("path", {
				id: "Vector_2",
				d: "M8 5.33333V1.33333",
				stroke: "currentColor",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ G("path", {
				id: "Vector_3",
				d: "M14.6667 8H1.33334",
				stroke: "currentColor",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ G("path", {
				id: "Vector_4",
				d: "M10 12.6667L8 10.6667L6 12.6667",
				stroke: "currentColor",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}),
			/* @__PURE__ */ G("path", {
				id: "Vector_5",
				d: "M10 3.33333L8 5.33333L6 3.33333",
				stroke: "currentColor",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})
		]
	}), /* @__PURE__ */ G("defs", { children: /* @__PURE__ */ G("clipPath", {
		id: "clip0_107_4135",
		children: /* @__PURE__ */ G("rect", {
			width: 16,
			height: 16,
			fill: "white"
		})
	}) })]
}), gt = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			d: "M2 14H14",
			stroke: "currentColor",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M2 8H14",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M8 2V11.3333",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M14 11.3333V3.33333C14 2.59695 13.403 2 12.6667 2H3.33333C2.59695 2 2 2.59695 2 3.33333V11.3333",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	]
}), _t = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [/* @__PURE__ */ G("path", {
		d: "M14 5.33333V3.33333C14 2.59695 13.403 2 12.6667 2H8M14 10.6667V12.6667C14 13.403 13.403 14 12.6667 14H8M2 10.6667V12.6667C2 13.403 2.59695 14 3.33333 14H8M2 5.33333V3.33333C2 2.59695 2.59695 2 3.33333 2H8M8 14V10.6667M8 2V5.33333",
		stroke: "#B2B2B2",
		strokeLinecap: "round",
		strokeLinejoin: "round"
	}), /* @__PURE__ */ G("path", {
		d: "M2 8H14",
		stroke: "currentColor",
		strokeLinecap: "round",
		strokeLinejoin: "round"
	})]
}), vt = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [/* @__PURE__ */ G("path", {
		d: "M10.6667 2H12.6667C13.403 2 14 2.59695 14 3.33333V8M5.33333 2H3.33333C2.59695 2 2 2.59695 2 3.33333V8M5.33333 14H3.33333C2.59695 14 2 13.403 2 12.6667V8M10.6667 14H12.6667C13.403 14 14 13.403 14 12.6667V8M2 8H5.33333M14 8H10.6667",
		stroke: "#B2B2B2",
		strokeLinecap: "round",
		strokeLinejoin: "round"
	}), /* @__PURE__ */ G("path", {
		d: "M8 2V14",
		stroke: "currentColor",
		strokeLinecap: "round",
		strokeLinejoin: "round"
	})]
}), yt = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			d: "M14 5.33333V3.33333C14 2.59695 13.403 2 12.6667 2H10.6667M14 10.6667V12.6667C14 13.403 13.403 14 12.6667 14H10.6667M2 10.6667V12.6667C2 13.403 2.59695 14 3.33333 14H5.33333M2 5.33333V3.33333C2 2.59695 2.59695 2 3.33333 2H5.33333",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M2 8H14",
			stroke: "currentColor",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M8 2V14",
			stroke: "currentColor",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	]
}), bt = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			d: "M4.66667 2H12.6667C13.403 2 14 2.59695 14 3.33333V12.6667C14 13.403 13.403 14 12.6667 14H4.66667",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M4.66667 8H14",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M8 2V14",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M2 2V14",
			stroke: "currentColor",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	]
}), xt = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			d: "M12.6667 2H3.33333C2.59695 2 2 2.59695 2 3.33333V12.6667C2 13.403 2.59695 14 3.33333 14H12.6667C13.403 14 14 13.403 14 12.6667V3.33333C14 2.59695 13.403 2 12.6667 2Z",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M2 8H14",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M8 2V14",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	]
}), St = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			d: "M12.6667 2H3.33333C2.59695 2 2 2.59695 2 3.33333V12.6667C2 13.403 2.59695 14 3.33333 14H12.6667C13.403 14 14 13.403 14 12.6667V3.33333C14 2.59695 13.403 2 12.6667 2Z",
			stroke: "currentColor",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M4.66667 8H11.3333",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M8 4.66667L8 11.3333",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	]
}), Ct = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			d: "M11.3333 2H3.33333C2.59695 2 2 2.59695 2 3.33333V12.6667C2 13.403 2.59695 14 3.33333 14H11.3333",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M2 8H11.3333",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M8 2V14",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M14 2V14",
			stroke: "currentColor",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	]
}), wt = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			d: "M14 4.66667V12.6667C14 13.403 13.403 14 12.6667 14H3.33333C2.59695 14 2 13.403 2 12.6667V4.66667",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M2 2H14",
			stroke: "currentColor",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M2 8H14",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		}),
		/* @__PURE__ */ G("path", {
			d: "M8 4.66667V14",
			stroke: "#B2B2B2",
			strokeLinecap: "round",
			strokeLinejoin: "round"
		})
	]
}), Tt = (e) => /* @__PURE__ */ G("svg", {
	width: 12,
	height: 14,
	viewBox: "0 0 12 14",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: /* @__PURE__ */ G("path", {
		fillRule: "evenodd",
		clipRule: "evenodd",
		d: "M0.182 13.305C0.303333 13.3917 0.468 13.435 0.676 13.435C0.962 13.435 1.24367 13.3483 1.521 13.175C1.79833 13.0103 2.05833 12.7937 2.301 12.525C2.55233 12.2563 2.77333 11.9703 2.964 11.667C3.16333 11.3637 3.32367 11.069 3.445 10.783C3.575 10.5057 3.653 10.276 3.679 10.094L4.459 5.011H5.954V4.439H4.537L4.706 3.36C4.80133 2.75334 4.96167 2.281 5.187 1.943C5.421 1.59634 5.73733 1.423 6.136 1.423C6.422 1.423 6.67767 1.488 6.903 1.618L7.189 1.787H7.293L7.566 1.28C7.592 1.23667 7.61367 1.189 7.631 1.137C7.657 1.085 7.67 1.04167 7.67 1.007C7.67 0.93767 7.64833 0.881336 7.605 0.838003C7.57033 0.786003 7.49233 0.72967 7.371 0.669003C7.30167 0.643003 7.22367 0.621336 7.137 0.604003C7.05033 0.578003 6.95933 0.565002 6.864 0.565002C6.53467 0.565002 6.20967 0.651669 5.889 0.825003C5.56833 0.98967 5.265 1.21067 4.979 1.488C4.693 1.75667 4.43733 2.047 4.212 2.359C3.98667 2.66234 3.80033 2.957 3.653 3.243C3.51433 3.52034 3.432 3.75434 3.406 3.945L3.328 4.439H2.249V5.011H3.25L2.405 10.692C2.31833 11.2813 2.17533 11.745 1.976 12.083C1.77667 12.4297 1.508 12.603 1.17 12.603C0.953333 12.603 0.788667 12.564 0.676 12.486L0.39 12.278H0.312L0.0779999 12.746C0.026 12.85 0 12.9367 0 13.006C0 13.1187 0.0606667 13.2183 0.182 13.305ZM5.90545 9.98999C5.82745 10.1027 5.78845 10.211 5.78845 10.315H6.65945C6.70279 10.211 6.75045 10.1113 6.80245 10.016C6.85445 9.91199 6.93245 9.78199 7.03645 9.62599C7.14045 9.46132 7.30079 9.23166 7.51745 8.93699C7.73412 8.64232 8.03312 8.25232 8.41445 7.76699L9.45445 10.341H9.49345L11.2745 9.92499V9.82099L10.3385 9.44399L9.37645 6.98699C9.80112 6.50166 10.1521 6.11166 10.4295 5.81699C10.7068 5.52232 10.9235 5.29266 11.0795 5.12799C11.2441 4.96332 11.3568 4.83332 11.4175 4.73799C11.4868 4.63399 11.5215 4.53432 11.5215 4.43899H10.7025C10.6678 4.52566 10.6288 4.61666 10.5855 4.71199C10.5421 4.79866 10.4728 4.91566 10.3775 5.06299C10.2908 5.20166 10.1565 5.39666 9.97445 5.64799C9.79245 5.89932 9.54545 6.22866 9.23345 6.63599L8.31045 4.30899H8.27145L6.43845 4.72499V4.82899L7.38745 5.21899L8.27145 7.40299C7.78612 7.95766 7.38312 8.40399 7.06245 8.74199C6.74179 9.07999 6.48612 9.34432 6.29545 9.53499C6.11345 9.72566 5.98345 9.87732 5.90545 9.98999Z",
		fill: "#828282"
	})
}), Et = (e) => /* @__PURE__ */ K("svg", {
	width: 100,
	height: 100,
	viewBox: "0 0 100 100",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			opacity: .8,
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M62.2449 0C62.2449 16.5084 55.687 32.3406 44.0138 44.0138C42.0408 45.9868 39.949 47.8137 37.7551 49.4875L37.7551 100C37.7551 83.4916 44.3131 67.6594 55.9863 55.9862C57.9593 54.0132 60.0511 52.1863 62.2449 50.5125L62.2449 0Z",
			fill: "#F2994A"
		}),
		/* @__PURE__ */ G("path", {
			opacity: .8,
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M37.7552 0.0239258C37.7488 10.0285 33.7717 19.622 26.697 26.6968C19.6165 33.7773 10.0133 37.755 6.10352e-05 37.755V62.2448C13.7182 62.2448 26.9694 57.7164 37.7552 49.4874V0.0239258Z",
			fill: "#F2994A"
		}),
		/* @__PURE__ */ G("path", {
			opacity: .8,
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M62.2449 99.976C62.2513 89.9713 66.2283 80.3779 73.3031 73.3031C80.3836 66.2226 89.9868 62.2449 100 62.2449V37.7551C86.2819 37.7551 73.0307 42.2835 62.2449 50.5125V99.976Z",
			fill: "#F2994A"
		}),
		/* @__PURE__ */ G("path", {
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M44.0138 44.0138C55.687 32.3406 62.2449 16.5084 62.2449 0H37.7551V49.4875C39.949 47.8137 42.0408 45.9868 44.0138 44.0138Z",
			fill: "#F2994A"
		}),
		/* @__PURE__ */ G("path", {
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M37.7551 99.9655C37.7551 99.977 37.7551 99.9885 37.7551 100H62.2449C62.2449 99.9912 62.2449 99.9825 62.2449 99.9737V50.5125C60.0511 52.1863 57.9593 54.0132 55.9862 55.9862C44.3212 67.6513 37.7643 83.4696 37.7551 99.9655Z",
			fill: "#F2994A"
		})
	]
}), Dt = (e) => /* @__PURE__ */ K("svg", {
	width: 16,
	height: 16,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			opacity: .8,
			d: "M9.95898 8.08594C9.60893 8.35318 9.27389 8.64313 8.95898 8.95801C7.09126 10.8257 6.042 13.3586 6.04199 16H6.04102V7.91406C6.39142 7.64662 6.72781 7.35715 7.04297 7.04199C8.90157 5.18307 9.9492 2.6648 9.95898 0.0371094V8.08594Z",
			fill: "white"
		}),
		/* @__PURE__ */ G("path", {
			opacity: .8,
			d: "M6.04102 7.91406C4.31493 9.23162 2.19571 9.95898 0 9.95898V6.04102C1.60208 6.04102 3.13861 5.40429 4.27148 4.27148C5.40436 3.13861 6.04101 1.60213 6.04102 0L6.04102 7.91406Z",
			fill: "white"
		}),
		/* @__PURE__ */ G("path", {
			opacity: .8,
			d: "M9.95947 8.08594C11.6856 6.76838 13.8048 6.04102 16.0005 6.04102V9.95898C14.3984 9.95898 12.8619 10.5957 11.729 11.7285C10.5961 12.8614 9.95948 14.3979 9.95947 16L9.95947 8.08594Z",
			fill: "white"
		}),
		/* @__PURE__ */ G("path", {
			d: "M9.95898 0C9.95898 2.64126 8.90957 5.17429 7.04199 7.04199C6.727 7.35698 6.39119 7.64674 6.04102 7.91406L6.04102 0H9.95898Z",
			fill: "white"
		}),
		/* @__PURE__ */ G("path", {
			d: "M6.04102 16C6.04102 13.3587 7.09042 10.8257 8.95801 8.95801C9.273 8.64302 9.60881 8.35326 9.95898 8.08594V16H6.04102Z",
			fill: "white"
		})
	]
}), Ot = (e) => /* @__PURE__ */ K("svg", {
	width: 570,
	height: 100,
	viewBox: "0 0 570 100",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	...e,
	children: [
		/* @__PURE__ */ G("path", {
			opacity: .8,
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M63.2036 0C63.2036 16.5084 56.6457 32.3406 44.9725 44.0138C42.9995 45.9868 40.9076 47.8137 38.7138 49.4875L38.7138 100C38.7138 83.4916 45.2718 67.6594 56.9449 55.9862C58.9179 54.0132 61.0098 52.1863 63.2036 50.5125L63.2036 0Z",
			fill: "#F2994A"
		}),
		/* @__PURE__ */ G("path", {
			opacity: .8,
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M38.7138 0.0239868C38.7075 10.0286 34.7304 19.6221 27.6556 26.6969C20.5752 33.7773 10.972 37.7551 0.95874 37.7551V62.2449C14.6768 62.2449 27.9281 57.7165 38.7138 49.4875V0.0239868Z",
			fill: "#F2994A"
		}),
		/* @__PURE__ */ G("path", {
			opacity: .8,
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M63.2036 99.976C63.21 89.9714 67.187 80.3779 74.2618 73.3031C81.3423 66.2227 90.9454 62.2449 100.959 62.2449V37.7551C87.2406 37.7551 73.9894 42.2835 63.2036 50.5125V99.976Z",
			fill: "#F2994A"
		}),
		/* @__PURE__ */ G("path", {
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M44.9725 44.0138C56.6457 32.3406 63.2036 16.5084 63.2036 0H38.7138V49.4875C40.9076 47.8137 42.9995 45.9868 44.9725 44.0138Z",
			fill: "#F2994A"
		}),
		/* @__PURE__ */ G("path", {
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M38.7138 99.9656C38.7138 99.9771 38.7138 99.9885 38.7138 100H63.2036C63.2036 99.9913 63.2036 99.9825 63.2036 99.9737V50.5125C61.0098 52.1863 58.9179 54.0132 56.9449 55.9862C45.2799 67.6513 38.7229 83.4696 38.7138 99.9656Z",
			fill: "#F2994A"
		}),
		/* @__PURE__ */ G("path", {
			fillRule: "evenodd",
			clipRule: "evenodd",
			d: "M402.852 37.2995H417.053C416.47 32.9711 415.23 29.1236 413.332 25.757C411.459 22.3651 409.067 19.5048 406.156 17.1761C403.245 14.822 399.929 13.0375 396.208 11.8225C392.487 10.6075 388.462 10 384.134 10C377.35 10 371.275 11.582 365.909 14.7461C360.543 17.9101 356.303 22.479 353.189 28.4528C350.076 34.4012 348.519 41.5646 348.519 49.943C348.519 58.2962 350.063 65.4596 353.151 71.4333C356.24 77.4071 360.467 81.976 365.833 85.14C371.199 88.3041 377.299 89.8861 384.134 89.8861C388.766 89.8861 392.981 89.2027 396.777 87.8358C400.574 86.4436 403.89 84.5199 406.725 82.0646C409.56 79.5839 411.851 76.7236 413.598 73.4836C415.369 70.2436 416.521 66.7758 417.053 63.0802L402.852 63.0043C402.422 65.2824 401.637 67.3074 400.498 69.0793C399.385 70.8511 398.005 72.3446 396.36 73.5596C394.74 74.7746 392.905 75.6985 390.854 76.3313C388.829 76.9388 386.652 77.2425 384.324 77.2425C380.122 77.2425 376.388 76.2174 373.123 74.1671C369.883 72.0914 367.326 69.0286 365.453 64.9786C363.605 60.9033 362.682 55.8915 362.682 49.943C362.682 44.0959 363.605 39.1473 365.453 35.0973C367.301 31.022 369.858 27.9339 373.123 25.8329C376.388 23.7067 380.134 22.6436 384.362 22.6436C386.741 22.6436 388.956 22.9726 391.006 23.6308C393.082 24.2636 394.93 25.2128 396.55 26.4784C398.17 27.744 399.524 29.2881 400.612 31.1106C401.701 32.9078 402.447 34.9707 402.852 37.2995ZM504.485 88.823V11.0631H490.74V88.823H504.485ZM529.06 86.1272C533.237 88.6838 538.236 89.962 544.058 89.962C548.943 89.962 553.196 89.0761 556.815 87.3042C560.435 85.507 563.295 83.0264 565.396 79.8624C567.497 76.673 568.712 73.0153 569.041 68.8894H555.904C555.499 70.9903 554.752 72.7749 553.664 74.243C552.576 75.7111 551.221 76.8375 549.601 77.6222C548.007 78.3816 546.197 78.7613 544.172 78.7613C541.311 78.7613 538.818 78.0019 536.692 76.4831C534.591 74.9391 532.958 72.7496 531.794 69.9146C530.63 67.0543 530.047 63.6371 530.047 59.663C530.047 55.7396 530.63 52.373 531.794 49.5634C532.984 46.7537 534.642 44.6021 536.768 43.1087C538.894 41.5899 541.362 40.8306 544.172 40.8306C547.488 40.8306 550.133 41.7798 552.107 43.6782C554.107 45.5513 555.373 47.8927 555.904 50.7024H569.041C568.738 46.5006 567.497 42.8302 565.32 39.6915C563.143 36.5274 560.22 34.0848 556.55 32.3635C552.905 30.617 548.715 29.7437 543.982 29.7437C538.287 29.7437 533.351 31.022 529.174 33.5785C525.023 36.1098 521.808 39.6535 519.53 44.2098C517.252 48.7407 516.113 53.9677 516.113 59.8908C516.113 65.7886 517.227 71.003 519.454 75.5339C521.707 80.0396 524.909 83.5706 529.06 86.1272ZM446.127 90C442.432 90 439.103 89.3419 436.141 88.0256C433.205 86.6841 430.876 84.7097 429.155 82.1025C427.459 79.4953 426.611 76.2807 426.611 72.4585C426.611 69.1679 427.219 66.4468 428.434 64.2952C429.649 62.1436 431.307 60.4224 433.408 59.1315C435.509 57.8405 437.875 56.866 440.508 56.2079C443.166 55.5244 445.912 55.0308 448.747 54.7271C452.164 54.3727 454.936 54.0563 457.062 53.7779C459.188 53.4741 460.733 53.0185 461.694 52.411C462.682 51.7782 463.175 50.8037 463.175 49.4874V49.2596C463.175 46.3993 462.327 44.1845 460.631 42.6151C458.935 41.0457 456.493 40.261 453.303 40.261C449.937 40.261 447.266 40.9951 445.292 42.4632C443.343 43.9313 442.027 45.6652 441.343 47.6649L428.51 45.8424C429.522 42.2987 431.193 39.3371 433.522 36.9578C435.85 34.5531 438.698 32.7559 442.065 31.5662C445.431 30.3512 449.152 29.7437 453.227 29.7437C456.037 29.7437 458.834 30.0728 461.618 30.7309C464.403 31.389 466.947 32.4774 469.25 33.9962C471.554 35.4896 473.401 37.5273 474.794 40.1092C476.211 42.691 476.92 45.9184 476.92 49.7912V88.823H463.707V80.8116H463.251C462.416 82.4316 461.239 83.9503 459.72 85.3678C458.227 86.76 456.341 87.8864 454.063 88.747C451.81 89.5823 449.165 90 446.127 90ZM449.696 79.9003C452.455 79.9003 454.847 79.3561 456.872 78.2677C458.897 77.1539 460.454 75.6858 461.543 73.8633C462.656 72.0408 463.213 70.0538 463.213 67.9022V61.0299C462.783 61.3843 462.049 61.7133 461.011 62.0171C459.998 62.3208 458.859 62.5866 457.594 62.8144C456.328 63.0422 455.075 63.2447 453.835 63.4219C452.595 63.5991 451.519 63.751 450.608 63.8775C448.557 64.156 446.722 64.6116 445.102 65.2444C443.482 65.8772 442.204 66.7632 441.267 67.9022C440.331 69.016 439.862 70.4588 439.862 72.2307C439.862 74.7619 440.786 76.673 442.634 77.9639C444.482 79.2549 446.836 79.9003 449.696 79.9003ZM298.477 54.6512V88.823H284.732V30.5031H297.869V40.4129H298.552C299.894 37.1476 302.033 34.5531 304.969 32.6293C307.931 30.7056 311.588 29.7437 315.942 29.7437C319.967 29.7437 323.473 30.6043 326.459 32.3256C329.472 34.0468 331.8 36.5401 333.446 39.8054C335.116 43.0707 335.939 47.0321 335.914 51.6896V88.823H322.169V53.8158C322.169 49.9177 321.156 46.8676 319.131 44.6654C317.132 42.4632 314.36 41.3621 310.816 41.3621C308.412 41.3621 306.273 41.8937 304.4 42.9568C302.552 43.9946 301.096 45.5007 300.033 47.4751C298.995 49.4495 298.477 51.8415 298.477 54.6512ZM230.313 86.2031C234.49 88.7091 239.426 89.962 245.121 89.962C250.816 89.962 255.752 88.7091 259.929 86.2031C264.105 83.6972 267.333 80.1914 269.611 75.6858C271.914 71.1802 273.066 65.9152 273.066 59.8908C273.066 53.8665 271.914 48.5888 269.611 44.0579C267.333 39.527 264.105 36.0085 259.929 33.5026C255.752 30.9967 250.816 29.7437 245.121 29.7437C239.426 29.7437 234.49 30.9967 230.313 33.5026C226.137 36.0085 222.897 39.527 220.593 44.0579C218.315 48.5888 217.176 53.8665 217.176 59.8908C217.176 65.9152 218.315 71.1802 220.593 75.6858C222.897 80.1914 226.137 83.6972 230.313 86.2031ZM252.943 76.4072C250.867 78.1031 248.285 78.9511 245.197 78.9511C242.033 78.9511 239.4 78.1031 237.299 76.4072C235.224 74.686 233.667 72.3825 232.629 69.4969C231.617 66.6113 231.111 63.3966 231.111 59.8529C231.111 56.2838 231.617 53.0565 232.629 50.1709C233.667 47.2599 235.224 44.9438 237.299 43.2226C239.4 41.5013 242.033 40.6407 245.197 40.6407C248.285 40.6407 250.867 41.5013 252.943 43.2226C255.018 44.9438 256.562 47.2599 257.575 50.1709C258.613 53.0565 259.131 56.2838 259.131 59.8529C259.131 63.3966 258.613 66.6113 257.575 69.4969C256.562 72.3825 255.018 74.686 252.943 76.4072ZM179.691 88.823V30.5031H193.018V40.2231H193.626C194.689 36.8565 196.512 34.262 199.093 32.4395C201.701 30.5917 204.675 29.6678 208.016 29.6678C208.775 29.6678 209.623 29.7057 210.56 29.7817C211.522 29.8323 212.319 29.9209 212.952 30.0475V42.691C212.37 42.4885 211.446 42.3113 210.18 42.1595C208.94 41.9823 207.738 41.8937 206.573 41.8937C204.067 41.8937 201.815 42.4379 199.815 43.5263C197.84 44.5895 196.284 46.0702 195.145 47.9687C194.006 49.8671 193.436 52.0566 193.436 54.5373V88.823H179.691ZM165.045 88.823V11.0631H150.959V88.823H165.045Z",
			fill: "#272525"
		})
	]
}), q = g(function({ variant: e = "primary", size: t = "md", pressed: n = !1, disabled: r = !1, children: i, startIcon: a, endIcon: o, style: s, className: c, ...l }, u) {
	let d = [
		"ic-button",
		`ic-button--${e}`,
		`ic-button--${t}`,
		c
	].filter(Boolean).join(" ");
	return /* @__PURE__ */ K("button", {
		ref: u,
		type: "button",
		disabled: r,
		"aria-pressed": n,
		className: d,
		style: s,
		...l,
		children: [
			a && /* @__PURE__ */ G("span", {
				className: "ic-button__icon",
				children: a
			}),
			i,
			o && /* @__PURE__ */ G("span", {
				className: "ic-button__icon",
				children: o
			})
		]
	});
});
q.displayName = "Button";
//#endregion
//#region src/components/Button/IconButton.tsx
var J = g(function({ icon: e, variant: t = "ghost", size: n = "sm", pressed: r = !1, disabled: i = !1, style: a, className: o, ...s }, c) {
	let l = [
		"ic-button",
		"ic-button--icon-only",
		`ic-button--${t}`,
		`ic-button--${n}`,
		o
	].filter(Boolean).join(" ");
	return /* @__PURE__ */ G("button", {
		ref: c,
		type: "button",
		className: l,
		disabled: i,
		"aria-pressed": r,
		style: a,
		...s,
		children: /* @__PURE__ */ G("span", {
			className: "ic-button__icon",
			children: e
		})
	});
});
J.displayName = "IconButton";
//#endregion
//#region src/components/FormulaHelper/formulaCompletion.ts
var kt = {
	abs: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"The value whose absolute value you want"
		]],
		description: "Returns the absolute value of a number, making negatives positive while leaving positives unchanged. Use it whenever the sign doesn't matter and you only care about magnitude - error distances, deviations, or the difference between two values regardless of direction.",
		examples: ["=ABS(-5) returns 5."]
	},
	accrint: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"issue",
				"date",
				"Issue date of the security"
			],
			[
				"first_interest",
				"date",
				"First interest date of the security"
			],
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"par",
				"number",
				"Face (par) value; defaults to 1000 if omitted"
			],
			[
				"frequency",
				"integer",
				"Number of coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention: 0=US 30/360, 1=actual/actual, 2=actual/360, 3=actual/365, 4=European 30/360"
			]
		],
		description: "Returns the accrued interest for a security that pays periodic interest. Use it when pricing bonds or other fixed-income instruments to determine how much interest has accumulated since the last coupon payment.",
		examples: ["=ACCRINT(issue, first_interest, settlement, rate, par, frequency, basis) returns the accrued interest."]
	},
	accrintm: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"issue",
				"date",
				"Issue date of the security"
			],
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"par*",
				"number",
				"Face (par) value; defaults to 1000 if omitted"
			],
			[
				"basis*",
				"integer",
				"Day-count convention: 0=US 30/360, 1=actual/actual, 2=actual/360, 3=actual/365, 4=European 30/360"
			]
		],
		description: "Returns the accrued interest on a security that pays interest at maturity rather than periodically. Use it when pricing zero-coupon or discount instruments where interest accumulates and is paid in full at the end.",
		examples: ["=ACCRINTM(issue, settlement, rate, par, basis) returns the total interest earned."]
	},
	acos: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"A cosine value between -1 and 1"
		]],
		description: "Returns the arccosine (inverse cosine) of a number, in radians. Use it in geometry and trigonometry when you know the cosine of an angle and need to find the angle itself.",
		examples: ["=ACOS(0.5) returns π/3 ≈ 1.047 radians (60°)."]
	},
	acosh: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"A number greater than or equal to 1"
		]],
		description: "Returns the inverse hyperbolic cosine of a number. Used in advanced mathematics and physics for problems involving hyperbolic geometry or special functions.",
		examples: ["=ACOSH(2) returns approximately 1.317."]
	},
	acot: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Any real number"
		]],
		description: "Returns the inverse cotangent of a number, in radians. A specialized trigonometric function used in surveying and engineering calculations.",
		examples: ["=ACOT(1) returns π/4 ≈ 0.785 radians (45°)."]
	},
	acoth: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"A real number whose absolute value is greater than 1"
		]],
		description: "Returns the inverse hyperbolic cotangent of a number. Appears in advanced mathematical and physical analysis.",
		examples: ["=ACOTH(2) returns approximately 0.549."]
	},
	address: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"row_num",
				"integer",
				"Row number for the cell reference (1 = row 1)"
			],
			[
				"col_num",
				"integer",
				"Column number for the cell reference (1 = column A)"
			],
			[
				"abs_num*",
				"integer",
				"Reference type: 1=absolute, 2=row absolute/col relative, 3=row relative/col absolute, 4=relative"
			],
			[
				"a1*",
				"logical",
				"TRUE or omitted for A1 style; FALSE for R1C1 style"
			],
			[
				"sheet_text*",
				"text",
				"Sheet name to include in the address"
			]
		],
		description: "Returns a cell address as a text string given a row number and column number. Use it to build dynamic cell references you can then pass to INDIRECT - for instance, constructing a reference from a formula-driven row and column.",
		examples: ["=ADDRESS(2, 3) returns \"$C$2\"."]
	},
	amordegrc: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"cost",
				"number",
				"Purchase cost of the asset"
			],
			[
				"date_purchased",
				"date",
				"Date the asset was bought"
			],
			[
				"first_period",
				"date",
				"End date of the first accounting period"
			],
			[
				"salvage",
				"number",
				"Residual value at the end of the asset's life"
			],
			[
				"period",
				"integer",
				"Accounting period to depreciate, starting at 0"
			],
			[
				"rate",
				"number",
				"Annual depreciation rate as a decimal"
			],
			[
				"basis*",
				"integer",
				"Year basis: 0=360-day NASD (default), 1=actual, 3=365-day, 4=360-day European; 2 is not allowed"
			]
		],
		description: "Returns the depreciation of an asset for one accounting period under the French declining-balance system, prorating the first period when the asset is bought part way through it. It works like AMORLINC but applies a coefficient set by the asset's life, so depreciation is heavier in the early periods.",
		examples: ["=AMORDEGRC(10000, A2, B2, 1000, 1, 0.15) returns the second period's depreciation."]
	},
	amorlinc: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"cost",
				"number",
				"Purchase cost of the asset"
			],
			[
				"date_purchased",
				"date",
				"Date the asset was bought"
			],
			[
				"first_period",
				"date",
				"End date of the first accounting period"
			],
			[
				"salvage",
				"number",
				"Residual value at the end of the asset's life"
			],
			[
				"period",
				"integer",
				"Accounting period to depreciate, starting at 0"
			],
			[
				"rate",
				"number",
				"Annual depreciation rate as a decimal"
			],
			[
				"basis*",
				"integer",
				"Year basis: 0=360-day NASD (default), 1=actual, 3=365-day, 4=360-day European; 2 is not allowed"
			]
		],
		description: "Returns the depreciation of an asset for one accounting period under the French straight-line system, prorating the first period when the asset is bought part way through it. Each full period writes off the same amount, unlike AMORDEGRC which front-loads it.",
		examples: ["=AMORLINC(10000, A2, B2, 1000, 1, 0.15) returns the second period's depreciation."]
	},
	and: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"logical1",
				"logical",
				"First condition to test"
			],
			[
				"logical2*",
				"logical",
				"Second condition to test"
			],
			[
				"...",
				"logical",
				"Additional conditions to test"
			]
		],
		description: "Returns TRUE if all of its arguments evaluate to TRUE, FALSE if any is FALSE. Use it to combine multiple conditions in an IF formula - for example, flagging rows where both a sales target and a margin target are met.",
		examples: ["=AND(A2>100, B2>0.2) returns TRUE only when both conditions hold."]
	},
	arabic: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"roman_text",
			"text",
			"A string containing a Roman numeral, e.g. \"XIV\""
		]],
		description: "Converts a Roman numeral text string to a regular number. Use it when historical or legacy data uses Roman numerals and you need to perform arithmetic on the values.",
		examples: ["=ARABIC(\"XIV\") returns 14."]
	},
	areas: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"reference",
			"reference",
			"A reference or multi-area selection whose area count you want"
		]],
		description: "Returns the number of separate areas (contiguous ranges) in a reference. In IronCalc we always return 1 as we do not support multi-area selections.",
		examples: ["=AREAS(A1:B2) returns 1."]
	},
	arraytotext: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"array",
			"array",
			"The array or range to convert to text"
		], [
			"format*",
			"integer",
			"Format mode: 0=concise (default), 1=strict with delimiters"
		]],
		description: "Converts an array or range to a text string, either in a concise display format or a strict parseable format. Use it when you want to show the contents of a spilled array as a single readable cell entry.",
		examples: ["=ARRAYTOTEXT(A2:A5, 1) returns \"{value1,value2,value3,value4}\"."]
	},
	asc: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"A string that may contain full-width characters"
		]],
		description: "Converts full-width (double-byte) characters to half-width (single-byte) equivalents in East Asian text. Use it to normalize text that may contain full-width characters entered via Japanese or Chinese input.",
		examples: ["=ASC(\"ＡＢＣＤ\") returns the half-width \"ABCD\"."]
	},
	asin: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"A sine value between -1 and 1"
		]],
		description: "Returns the arcsine (inverse sine) of a number, in radians. Use it in geometry when you know the sine of an angle and need the angle itself.",
		examples: ["=ASIN(0.5) returns π/6 ≈ 0.524 radians (30°)."]
	},
	asinh: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Any real number"
		]],
		description: "Returns the inverse hyperbolic sine of a number. Used in engineering and advanced mathematics where hyperbolic functions arise.",
		examples: ["=ASINH(1) returns approximately 0.881."]
	},
	atan: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Any real number representing the tangent"
		]],
		description: "Returns the arctangent (inverse tangent) of a number in radians, in the range −π/2 to π/2. Use it to find an angle from a slope or ratio when the quadrant doesn't matter.",
		examples: ["=ATAN(1) returns π/4 ≈ 0.785 radians (45°)."]
	},
	atan2: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"x_num",
			"number",
			"The x-coordinate of the point"
		], [
			"y_num",
			"number",
			"The y-coordinate of the point"
		]],
		description: "Returns the arctangent of a point defined by x and y coordinates in radians, correctly handling all four quadrants. Use it when you have x and y components and need the direction angle of a vector.",
		examples: ["=ATAN2(1, 1) returns π/4; =ATAN2(-1, 0) returns π (pointing left)."]
	},
	atanh: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"A value strictly between -1 and 1"
		]],
		description: "Returns the inverse hyperbolic tangent of a number. Used in advanced statistics (the Fisher z-transformation) and mathematics.",
		examples: ["=ATANH(0.5) returns approximately 0.549."]
	},
	avedev: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"value1",
				"number_or_range",
				"First value or range to include"
			],
			[
				"value2*",
				"number_or_range",
				"Second value or range to include"
			],
			[
				"...",
				"number_or_range",
				"Additional values or ranges"
			]
		],
		description: "Returns the average of the absolute deviations of data points from their mean - a simple, intuitive measure of spread. Use it to communicate variability to an audience that finds standard deviation abstract.",
		examples: ["=AVEDEV(A2:A20) returns the mean absolute deviation."]
	},
	average: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"value1",
				"number_or_range",
				"First value or range to average"
			],
			[
				"value2*",
				"number_or_range",
				"Additional values or ranges"
			],
			[
				"...",
				"number_or_range",
				"Additional values or ranges"
			]
		],
		description: "Returns the arithmetic mean of a set of numbers.",
		examples: ["=AVERAGE(A2:A100) returns the mean of the range."]
	},
	averagea: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"value1",
				"value_or_range",
				"First value or range; text and FALSE count as 0, TRUE counts as 1"
			],
			[
				"value2*",
				"value_or_range",
				"Additional values or ranges"
			],
			[
				"...",
				"value_or_range",
				"Additional values or ranges"
			]
		],
		description: "Like AVERAGE, but includes text (counted as 0) and logical values (TRUE=1, FALSE=0) in the calculation.",
		examples: ["=AVERAGEA(A2:A20) treats text and FALSE as 0."]
	},
	averageif: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"range",
				"range",
				"Cells to evaluate against the criteria"
			],
			[
				"criteria",
				"number_or_text",
				"Condition to match, e.g. \">10\", \"East\" or 32"
			],
			[
				"average_range*",
				"range",
				"Cells to average; if omitted, averages the cells in range"
			]
		],
		description: "Returns the average of cells that meet a single condition. Use it to find the mean for a specific category - for example, the average sale amount for a particular product.",
		examples: ["=AVERAGEIF(B2:B100, \"Widgets\", C2:C100) averages C where B is \"Widgets\"."]
	},
	averageifs: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"avg_rng",
				"range",
				"Cells to average"
			],
			[
				"range1*",
				"range",
				"First range to test against a condition"
			],
			[
				"criteria1*",
				"number_or_text",
				"Condition to apply to range1"
			],
			[
				"range2*",
				"range",
				"Additional ranges to test"
			],
			[
				"...",
				"any",
				"Additional criteria matching the extra ranges"
			]
		],
		description: "Returns the average of cells that meet multiple conditions simultaneously. The multi-condition version of AVERAGEIF - use it when you need to average a filtered subset with two or more criteria.",
		examples: ["=AVERAGEIFS(C2:C100, B2:B100, \"West\", D2:D100, \"Q1\") averages where both conditions are met."]
	},
	base: {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"number",
				"integer",
				"Value to convert; must be a non-negative integer"
			],
			[
				"radix",
				"integer",
				"Target base between 2 and 36"
			],
			[
				"min_length*",
				"integer",
				"Minimum character width of the result, padded with leading zeros"
			]
		],
		description: "Converts a number to a text string representation in any base (radix) from 2 to 36. Use it as a general-purpose base converter - handy for bases not covered by DEC2BIN or DEC2HEX.",
		examples: ["=BASE(255, 16) returns \"FF\"; =BASE(10, 2) returns \"1010\"."]
	},
	besseli: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"number",
			"The value at which to evaluate the function"
		], [
			"order",
			"number",
			"The order of the Bessel function, n"
		]],
		description: "Returns the modified Bessel function of the first kind, Iₙ(x). Use it in science and engineering for problems involving heat conduction, signal processing, or cylindrical wave patterns.",
		examples: ["=BESSELI(2.5, 1) returns I₁(2.5)."]
	},
	besselj: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"number",
			"The value at which to evaluate the function"
		], [
			"order",
			"number",
			"The order of the Bessel function, n"
		]],
		description: "Returns the Bessel function of the first kind, Jₙ(x). Used in physics and engineering - particularly for vibrating membranes, antenna design, and acoustics.",
		examples: ["=BESSELJ(2.5, 1) returns J₁(2.5)."]
	},
	besselk: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"number",
			"The value at which to evaluate the function"
		], [
			"order",
			"number",
			"The order of the Bessel function, n"
		]],
		description: "Returns the modified Bessel function of the second kind, Kₙ(x). Appears in engineering problems involving heat flow and diffusion in cylindrical geometries.",
		examples: ["=BESSELK(2.5, 1) returns K₁(2.5)."]
	},
	bessely: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"number",
			"The value at which to evaluate the function"
		], [
			"order",
			"number",
			"The order of the Bessel function, n"
		]],
		description: "Returns the Bessel function of the second kind (Neumann function), Yₙ(x). Used alongside BESSELJ in wave and vibration problems where a second independent solution is required.",
		examples: ["=BESSELY(2.5, 1) returns Y₁(2.5)."]
	},
	"beta.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"The value at which to evaluate the function"
			],
			[
				"alpha",
				"number",
				"Shape parameter alpha"
			],
			[
				"beta",
				"number",
				"Shape parameter beta"
			],
			[
				"cumulative",
				"boolean",
				"TRUE for cumulative distribution, FALSE for probability density function"
			],
			[
				"a*",
				"number",
				"Lower bound of the distribution; defaults to 0"
			],
			[
				"b*",
				"number",
				"Upper bound of the distribution; defaults to 1"
			]
		],
		description: "Returns the beta distribution probability - either the cumulative probability (CDF) or the probability density (PDF) at a given value. Use it in project management and Bayesian statistics to model probabilities constrained between 0 and 1.",
		examples: ["=BETA.DIST(0.4, 2, 5, TRUE) returns the cumulative probability at 0.4."]
	},
	"beta.inv": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Probability between 0 and 1"
			],
			[
				"alpha",
				"number",
				"Shape parameter alpha"
			],
			[
				"beta",
				"number",
				"Shape parameter beta"
			],
			[
				"a*",
				"number",
				"Lower bound of the distribution; defaults to 0"
			],
			[
				"b*",
				"number",
				"Upper bound of the distribution; defaults to 1"
			]
		],
		description: "Returns the inverse of the beta cumulative distribution - the value at which the CDF reaches a given probability. Use it to find percentile values of a beta-distributed variable.",
		examples: ["=BETA.INV(0.95, 2, 5) returns the 95th percentile."]
	},
	betadist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value to evaluate, between A and B"
			],
			[
				"alpha",
				"number",
				"Shape parameter alpha"
			],
			[
				"beta",
				"number",
				"Shape parameter beta"
			],
			[
				"a*",
				"number",
				"Lower bound; defaults to 0"
			],
			[
				"b*",
				"number",
				"Upper bound; defaults to 1"
			]
		],
		description: "Compatibility name for BETA.DIST (cumulative form). Kept for compatibility with Excel 2007 and earlier workbooks. Prefer BETA.DIST in new formulas.",
		examples: ["=BETADIST(0.5, 2, 5) is equivalent to =BETA.DIST(0.5, 2, 5, TRUE)."]
	},
	betainv: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Probability between 0 and 1"
			],
			[
				"alpha",
				"number",
				"Shape parameter alpha"
			],
			[
				"beta",
				"number",
				"Shape parameter beta"
			],
			[
				"a*",
				"number",
				"Lower bound; defaults to 0"
			],
			[
				"b*",
				"number",
				"Upper bound; defaults to 1"
			]
		],
		description: "Compatibility name for BETA.INV. Kept for compatibility with Excel 2007 and earlier workbooks. Prefer BETA.INV in new formulas.",
		examples: ["=BETAINV(0.5, 2, 5) is equivalent to =BETA.INV(0.5, 2, 5)."]
	},
	bin2dec: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"text",
			"Binary string to convert, up to 10 digits"
		]],
		description: "Converts a binary number (base 2) to its decimal equivalent. Use it when working with digital logic, bitwise operations, or any data that arrives in binary format.",
		examples: ["=BIN2DEC(\"1010\") returns 10."]
	},
	bin2hex: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"text",
			"Binary string to convert"
		], [
			"places*",
			"integer",
			"Minimum width of the result, padded with leading zeros"
		]],
		description: "Converts a binary number to hexadecimal. Use it when you need to move between binary and hex - common in programming and hardware documentation.",
		examples: ["=BIN2HEX(\"11111111\") returns \"FF\"."]
	},
	bin2oct: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"text",
			"Binary string to convert"
		], [
			"places*",
			"integer",
			"Minimum width of the result, padded with leading zeros"
		]],
		description: "Converts a binary number to octal (base 8). Useful in computing contexts where octal notation is used, such as Unix file permissions.",
		examples: ["=BIN2OCT(\"111\") returns \"7\"."]
	},
	"binom.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"number_s",
				"integer",
				"Number of successes"
			],
			[
				"trials",
				"integer",
				"Total number of independent trials"
			],
			[
				"probability_s",
				"number",
				"Probability of success on each trial"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative probability up to number_s; FALSE for the exact probability"
			]
		],
		description: "Returns the binomial distribution probability for exactly k successes in n independent trials. Use it for quality control, survey analysis, and any yes/no experiment - for instance, the probability of exactly 3 heads in 10 coin flips.",
		examples: ["=BINOM.DIST(3, 10, 0.5, FALSE) returns that exact probability."]
	},
	"binom.dist.range": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"trials",
				"integer",
				"Total number of independent trials"
			],
			[
				"probability_s",
				"number",
				"Probability of success on each trial"
			],
			[
				"number_s",
				"integer",
				"Number of successes (lower bound of the range)"
			],
			[
				"number_s2*",
				"integer",
				"Upper bound of the range; if omitted, returns the probability of exactly number_s successes"
			]
		],
		description: "Returns the probability that the number of successes in a binomial trial falls within a specified range. Use it when you want \"between k₁ and k₂ successes\" rather than an exact count.",
		examples: ["=BINOM.DIST.RANGE(10, 0.5, 3, 7) returns P(3 ≤ X ≤ 7) for 10 fair coin flips."]
	},
	"binom.inv": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"trials",
				"integer",
				"Total number of independent trials"
			],
			[
				"probability_s",
				"number",
				"Probability of success on each trial"
			],
			[
				"alpha",
				"number",
				"Criterion value: the cumulative probability threshold, between 0 and 1"
			]
		],
		description: "Returns the smallest number of successes such that the cumulative binomial probability reaches at least a given value. Use it to find the threshold count for a given confidence level in quality or acceptance sampling.",
		examples: ["=BINOM.INV(10, 0.5, 0.75) returns the 75th-percentile count."]
	},
	binomdist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"number_s",
				"integer",
				"Number of successes"
			],
			[
				"trials",
				"integer",
				"Number of trials"
			],
			[
				"probability_s",
				"number",
				"Probability of success on each trial"
			],
			[
				"cumulative",
				"logical",
				"TRUE for cumulative distribution; FALSE for exact probability"
			]
		],
		description: "Compatibility name for BINOM.DIST. Kept for compatibility with Excel 2007 and earlier workbooks. Prefer BINOM.DIST in new formulas.",
		examples: ["=BINOMDIST(6, 10, 0.5, FALSE) is equivalent to =BINOM.DIST(6, 10, 0.5, FALSE)."]
	},
	bitand: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number1",
			"integer",
			"First non-negative integer"
		], [
			"number2",
			"integer",
			"Second non-negative integer"
		]],
		description: "Returns a bitwise AND of two numbers - the result has a 1 bit only where both inputs have a 1 bit. Use it for flag testing, permission masking, or any low-level binary calculation.",
		examples: ["=BITAND(12, 10) returns 8 (1100 AND 1010 = 1000)."]
	},
	bitlshift: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"integer",
			"Non-negative integer to shift"
		], [
			"shift_amount",
			"integer",
			"Number of bit positions to shift left"
		]],
		description: "Shifts a number's binary representation left by a given number of bits, multiplying by 2 for each shift. Use it for bit manipulation in data encoding or protocol analysis.",
		examples: ["=BITLSHIFT(4, 2) returns 16."]
	},
	bitor: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number1",
			"integer",
			"First non-negative integer"
		], [
			"number2",
			"integer",
			"Second non-negative integer"
		]],
		description: "Returns a bitwise OR of two numbers - the result has a 1 bit wherever either input has a 1. Use it to combine bit flags or to set specific bits in a value.",
		examples: ["=BITOR(12, 10) returns 14 (1100 OR 1010 = 1110)."]
	},
	bitrshift: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"integer",
			"Non-negative integer to shift"
		], [
			"shift_amount",
			"integer",
			"Number of bit positions to shift right"
		]],
		description: "Shifts a number's bits right by a given count, dividing by 2 for each shift. Use it to extract the upper bits of a value or to reverse a left shift.",
		examples: ["=BITRSHIFT(16, 2) returns 4."]
	},
	bitxor: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number1",
			"integer",
			"First non-negative integer"
		], [
			"number2",
			"integer",
			"Second non-negative integer"
		]],
		description: "Returns a bitwise XOR (exclusive OR) of two numbers - the result has a 1 bit where the inputs differ. Use it for checksum calculations or to toggle specific bits.",
		examples: ["=BITXOR(12, 10) returns 6 (1100 XOR 1010 = 0110)."]
	},
	bycol: {
		tier: 0,
		category: 6,
		tags: [],
		args: [[
			"array",
			"array",
			"Array or range to process, one column at a time"
		], [
			"lambda",
			"function",
			"LAMBDA that receives a single column and returns a scalar"
		]],
		description: "Applies a LAMBDA or built-in function to each column of an array and returns one result per column. Use it to compute column-wise summaries - like summing or averaging each column of a data block - without writing separate formulas for each column.",
		examples: ["=BYCOL(A1:D10, LAMBDA(col, SUM(col))) returns the sum of each of the four columns as a single row."]
	},
	byrow: {
		tier: 0,
		category: 6,
		tags: [],
		args: [[
			"array",
			"array",
			"Array or range to process, one row at a time"
		], [
			"function",
			"function",
			"LAMBDA that receives a single row and returns a scalar"
		]],
		description: "Applies a LAMBDA or built-in function to each row of an array and returns one result per row. Use it to compute row-wise summaries - for instance, the maximum value in each row of a multi-column dataset.",
		examples: ["=BYROW(A1:D10, LAMBDA(row, MAX(row))) returns the row maximum for each of the 10 rows."]
	},
	ceiling: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round up"
		], [
			"significance",
			"number",
			"Multiple to round up to"
		]],
		description: "Rounds a number up to the nearest multiple of a significance value. Use it when you need to round up to a specific increment - for example, always rounding prices up to the nearest $0.05 or time up to the next 15 minutes.",
		examples: ["=CEILING(4.3, 0.5) returns 4.5."]
	},
	"ceiling.math": {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"number",
				"number",
				"Value to round up"
			],
			[
				"significance*",
				"number",
				"Rounding multiple; defaults to 1"
			],
			[
				"mode*",
				"integer",
				"0 rounds negative numbers away from zero; 1 rounds them toward zero"
			]
		],
		description: "Rounds a number up to the nearest multiple of significance, with a mode argument that controls how negative numbers are handled. Use it when you need consistent rounding for both positive and negative values.",
		examples: ["=CEILING.MATH(-4.3, 1) returns -4 (toward zero by default)."]
	},
	"ceiling.precise": {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round up"
		], [
			"significance*",
			"number",
			"Multiple to round up to; always rounds away from zero"
		]],
		description: "Rounds a number up toward positive infinity to the nearest multiple of significance, regardless of sign. Use it when you always want to round toward positive infinity for both positive and negative numbers.",
		examples: ["=CEILING.PRECISE(-4.3, 1) returns -4."]
	},
	cell: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"info_type",
			"text",
			"Category of information to return, e.g. \"address\", \"format\", \"type\", \"width\""
		], [
			"...",
			"reference",
			"Cell to inspect; defaults to the last changed cell if omitted"
		]],
		description: "Returns information about a cell's formatting, location, or contents - such as its address, column width, or format code. Use it for dynamic reporting where you need to inspect cell metadata rather than its value.",
		examples: ["=CELL(\"address\", A1) returns \"$A$1\"."]
	},
	char: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"number",
			"integer",
			"Code point between 1 and 255 in the system character set"
		]],
		description: "Returns the character corresponding to a given character code (ASCII or Unicode). Use it to insert special characters - a line break (CHAR(10)), a tab (CHAR(9)), or any character that can't be typed directly - into text formulas.",
		examples: ["=A2&CHAR(10)&B2 creates a two-line cell entry."]
	},
	chidist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"x",
			"number",
			"Value to evaluate (non-negative)"
		], [
			"degrees_freedom",
			"integer",
			"Degrees of freedom"
		]],
		description: "Compatibility name for CHISQ.DIST.RT (right-tail chi-squared distribution). Prefer CHISQ.DIST.RT in new formulas.",
		examples: ["=CHIDIST(3.84, 1) is equivalent to =CHISQ.DIST.RT(3.84, 1)."]
	},
	chiinv: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"probability",
			"number",
			"Right-tail probability between 0 and 1"
		], [
			"degrees_freedom",
			"integer",
			"Degrees of freedom"
		]],
		description: "Compatibility name for CHISQ.INV.RT. Prefer CHISQ.INV.RT in new formulas.",
		examples: ["=CHIINV(0.05, 1) is equivalent to =CHISQ.INV.RT(0.05, 1)."]
	},
	"chisq.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"The value at which to evaluate the distribution"
			],
			[
				"deg_freedom",
				"integer",
				"Number of degrees of freedom"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution function; FALSE for the probability density function"
			]
		],
		description: "Returns the chi-squared distribution probability (left-tailed CDF or PDF). Use it in goodness-of-fit tests and tests of independence when analyzing categorical data.",
		examples: ["=CHISQ.DIST(5, 3, TRUE) returns the left-tail CDF at 5 with 3 degrees of freedom."]
	},
	"chisq.dist.rt": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"x",
			"number",
			"The value at which to evaluate the distribution"
		], [
			"deg_freedom",
			"integer",
			"Number of degrees of freedom"
		]],
		description: "Returns the right-tailed chi-squared distribution probability. Use it to find the p-value for a chi-squared test statistic - values close to 0 indicate statistical significance.",
		examples: ["=CHISQ.DIST.RT(5, 3) returns the right-tail probability."]
	},
	"chisq.inv": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"probability",
			"number",
			"Left-tail probability between 0 and 1 associated with the chi-squared distribution"
		], [
			"deg_freedom",
			"integer",
			"Number of degrees of freedom"
		]],
		description: "Returns the inverse of the left-tailed chi-squared distribution - the value at which the CDF equals a given probability. Use it to find percentile values or critical values for chi-squared tests.",
		examples: ["=CHISQ.INV(0.95, 3) returns the 95th percentile with 3 degrees of freedom."]
	},
	"chisq.inv.rt": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"probability",
			"number",
			"Right-tail probability between 0 and 1 associated with the chi-squared distribution"
		], [
			"deg_freedom",
			"integer",
			"Number of degrees of freedom"
		]],
		description: "Returns the inverse of the right-tailed chi-squared distribution. Use it to find the critical value at a given significance level for a chi-squared test.",
		examples: ["=CHISQ.INV.RT(0.05, 3) returns the critical value at the 5% level."]
	},
	"chisq.test": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"actual_range",
			"range",
			"The range of observed frequencies to test against expected values"
		], [
			"expected_range",
			"range",
			"The range of expected frequencies; must have the same number of data points as actual_range"
		]],
		description: "Returns the p-value for a chi-squared test of independence between observed and expected frequencies. Use it to determine whether an association between two categorical variables is statistically significant.",
		examples: ["=CHISQ.TEST(actual_range, expected_range) returns the p-value."]
	},
	chitest: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"actual_range",
			"range",
			"Observed values"
		], [
			"expected_range",
			"range",
			"Expected values"
		]],
		description: "Compatibility name for CHISQ.TEST. Prefer CHISQ.TEST in new formulas.",
		examples: ["=CHITEST(B2:C5, E2:F5) is equivalent to =CHISQ.TEST(B2:C5, E2:F5)."]
	},
	choose: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"index_num",
				"integer",
				"1-based position of the value to return"
			],
			[
				"value1",
				"any",
				"First possible value"
			],
			[
				"...",
				"any",
				"Additional possible values"
			]
		],
		description: "Returns a value from a list based on an index number. Use it to map a numeric code to a corresponding label or value - like converting 1, 2, 3 into \"Low\", \"Medium\", \"High\" without nested IFs.",
		examples: ["=CHOOSE(2, \"Low\", \"Medium\", \"High\") returns \"Medium\"."]
	},
	choosecols: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Source array or range"
			],
			[
				"col_num1",
				"integer",
				"Index of the first column to include; negative counts from the end"
			],
			[
				"...",
				"integer",
				"Additional column indices"
			]
		],
		description: "Returns the specified columns from an array, in the order you list them. Use it to reorder or select a subset of columns from a table without writing multiple INDEX formulas.",
		examples: ["=CHOOSECOLS(A1:D10, 3, 1) returns columns C and A of the table (in that order)."]
	},
	chooserows: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Source array or range"
			],
			[
				"row_num1",
				"integer",
				"Index of the first row to include; negative counts from the end"
			],
			[
				"...",
				"integer",
				"Additional row indices"
			]
		],
		description: "Returns the specified rows from an array. Use it to extract or reorder rows by position - for instance, to pull specific rows from a result set.",
		examples: ["=CHOOSEROWS(A1:D10, 1, 5, 10) returns rows 1, 5, and 10."]
	},
	clean: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String to strip of non-printable characters"
		]],
		description: "Removes non-printable characters (the first 32 ASCII control characters) from a text string. Use it to scrub imported data that contains hidden control characters causing display or formula problems.",
		examples: ["=CLEAN(A2) strips any control characters from the text."]
	},
	code: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String whose first character's code point you want"
		]],
		description: "Returns the numeric character code of the first character in a text string. The inverse of CHAR - use it to find the code for an unusual character so you can reference it with CHAR or identify unexpected characters in data.",
		examples: ["=CODE(\"A\") returns 65."]
	},
	column: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"...",
			"reference",
			"Cell or range whose column number to return; uses the formula cell if omitted"
		]],
		description: "Returns the column number of a reference (or the current cell if no reference is given). Use it to generate column-position helpers, to build dynamic ranges, or in array formulas that need to know the column index.",
		examples: ["=COLUMN(C5) returns 3."]
	},
	columns: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"array",
			"array",
			"Range or array whose column count you want"
		]],
		description: "Returns the number of columns in a range or array. Use it when you need to know the width of a dynamic range - for instance, to construct an offset or to validate array dimensions.",
		examples: ["=COLUMNS(A1:E1) returns 5."]
	},
	combin: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"integer",
			"Total number of items"
		], [
			"number_chosen",
			"integer",
			"Number of items to choose, without regard to order"
		]],
		description: "Returns the number of combinations of n items taken k at a time, ignoring order. Use it in probability and statistics to count how many ways you can choose a subset from a larger group.",
		examples: ["=COMBIN(10, 3) returns 120 (the number of ways to choose 3 from 10)."]
	},
	combina: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"integer",
			"Total number of items"
		], [
			"number_chosen",
			"integer",
			"Number of items to choose, allowing repetition"
		]],
		description: "Returns the number of combinations with repetition allowed (multiset coefficients). Use it when items can be chosen more than once - for instance, counting selections from a menu where items repeat.",
		examples: ["=COMBINA(4, 2) returns 10."]
	},
	complex: {
		tier: 0,
		category: 3,
		tags: [],
		args: [
			[
				"real_num",
				"number",
				"Real part of the complex number"
			],
			[
				"i_num",
				"number",
				"Imaginary part of the complex number"
			],
			[
				"suffix*",
				"text",
				"\"i\" or \"j\" as the imaginary unit suffix; defaults to \"i\""
			]
		],
		description: "Creates a complex number text string from real and imaginary parts in the form \"a+bi\". Use it as the starting point for complex-number calculations in engineering or signal analysis.",
		examples: ["=COMPLEX(3, 4) returns \"3+4i\"."]
	},
	concat: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text1",
			"any",
			"First value or range to join"
		], [
			"...",
			"any",
			"Additional values or ranges"
		]],
		description: "Joins multiple text strings or ranges together into one string, with no separator between them. Use it to combine text from several cells - for instance, assembling a full name from first-name and last-name columns.",
		examples: ["=CONCAT(A2, \" \", B2) joins first and last names with a space."]
	},
	concatenate: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text1",
				"text",
				"First string to join"
			],
			[
				"text2",
				"text",
				"Second string"
			],
			[
				"text3*",
				"text",
				"Additional strings"
			]
		],
		description: "Joins text strings together - an older function superseded by CONCAT. CONCAT is preferred because it also accepts ranges, while CONCATENATE requires individual cell references listed one by one.",
		examples: ["=CONCATENATE(A2, \" \", B2)."]
	},
	confidence: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"alpha",
				"number",
				"Significance level; e.g. 0.05 for 95% confidence"
			],
			[
				"standard_dev",
				"number",
				"Population standard deviation"
			],
			[
				"size",
				"integer",
				"Sample size"
			]
		],
		description: "Compatibility name for CONFIDENCE.NORM. Prefer CONFIDENCE.NORM in new formulas.",
		examples: ["=CONFIDENCE(0.05, 2.5, 100) is equivalent to =CONFIDENCE.NORM(0.05, 2.5, 100)."]
	},
	"confidence.norm": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"alpha",
				"number",
				"Significance level; e.g. 0.05 for 95% confidence"
			],
			[
				"standard_dev",
				"number",
				"Population standard deviation"
			],
			[
				"size",
				"integer",
				"Sample size"
			]
		],
		description: "Returns the margin of error for a population mean using the normal distribution. Use it to build a confidence interval: the true mean is likely between AVERAGE ± CONFIDENCE.NORM.",
		examples: ["=CONFIDENCE.NORM(0.05, STDEV.P(A2:A100), COUNT(A2:A100)) returns the margin for a 95% confidence interval."]
	},
	"confidence.t": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"alpha",
				"number",
				"Significance level; e.g. 0.05 for 95% confidence"
			],
			[
				"standard_dev",
				"number",
				"Sample standard deviation"
			],
			[
				"size",
				"integer",
				"Sample size; must be greater than 1"
			]
		],
		description: "Like CONFIDENCE.NORM but uses the Student's t-distribution, appropriate for small samples where the population standard deviation is unknown. Use it when your sample size is small (typically under 30).",
		examples: ["=CONFIDENCE.T(0.05, STDEV(A2:A20), 20) returns the margin for 20 data points."]
	},
	convert: {
		tier: 0,
		category: 3,
		tags: [],
		args: [
			[
				"number",
				"number",
				"Value to convert"
			],
			[
				"from_unit",
				"text",
				"Source unit abbreviation, e.g. \"kg\", \"mi\", \"C\""
			],
			[
				"to_unit",
				"text",
				"Target unit abbreviation"
			]
		],
		description: "Converts a measurement from one unit to another - miles to kilometers, pounds to kilograms, inches to centimeters, and many more. Use it whenever you need to bridge different unit systems without hand-coding conversion factors.",
		examples: ["=CONVERT(100, \"mi\", \"km\") returns the equivalent distance in kilometers."]
	},
	correl: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array1",
			"number_or_range",
			"First dataset"
		], [
			"array2",
			"number_or_range",
			"Second dataset"
		]],
		description: "Returns the Pearson correlation coefficient (r) between two datasets, ranging from −1 to 1. Use it to measure how strongly two variables move together - for instance, whether advertising spend correlates with sales.",
		examples: ["=CORREL(A2:A100, B2:B100) returns the correlation coefficient."]
	},
	cos: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Angle in radians"
		]],
		description: "Returns the cosine of an angle given in radians. Use it in geometry, physics, and engineering wherever the cosine function is needed.",
		examples: ["=COS(PI()/3) returns 0.5 (cosine of 60°)."]
	},
	cosh: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Any real number"
		]],
		description: "Returns the hyperbolic cosine of a number. Used in engineering and physics - for instance, in catenary curve calculations and heat transfer problems.",
		examples: ["=COSH(1) returns approximately 1.543."]
	},
	cot: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Angle in radians; cannot be a multiple of π"
		]],
		description: "Returns the cotangent of an angle in radians (cosine divided by sine). A derived trigonometric function used in some geometry and physics applications.",
		examples: ["=COT(PI()/4) returns 1."]
	},
	coth: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Non-zero real number"
		]],
		description: "Returns the hyperbolic cotangent of a number. Appears in advanced mathematical and physical analysis.",
		examples: ["=COTH(1) returns approximately 1.313."]
	},
	count: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"value1",
			"any",
			"First value or range to count numeric entries in"
		], [
			"...",
			"any",
			"Additional values or ranges"
		]],
		description: "Counts the number of cells that contain numeric values in a range. Use it to know how many valid data points you have before computing averages or to verify data completeness.",
		examples: ["=COUNT(A2:A100) returns how many cells in the range hold numbers."]
	},
	counta: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"value1",
			"any",
			"First value or range to count non-empty entries in"
		], [
			"...",
			"any",
			"Additional values or ranges"
		]],
		description: "Counts all non-empty cells in a range regardless of content type. Use it when your data includes text, numbers, and logical values and you want the total number of entries, not just numeric ones.",
		examples: ["=COUNTA(A2:A100) counts all non-blank cells."]
	},
	countblank: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"range",
			"range",
			"Range whose empty cells you want to count"
		]],
		description: "Counts the empty cells in a range. Use it to find missing data - a high COUNTBLANK on a critical column signals incomplete records that need attention.",
		examples: ["=COUNTBLANK(A2:A100) returns how many cells have no content."]
	},
	countif: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"range",
			"range",
			"Cells to evaluate against the condition"
		], [
			"criteria",
			"any",
			"Condition to match, e.g. \">10\" or \"apples\""
		]],
		description: "Counts cells in a range that meet a single condition. Use it to tally how many records match a criterion - how many sales are in the West region, how many scores exceed 90, etc.",
		examples: ["=COUNTIF(B2:B100, \"West\") counts the \"West\" entries."]
	},
	countifs: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"range1",
				"range",
				"First range to evaluate"
			],
			[
				"criteria1*",
				"any",
				"Condition for range1"
			],
			[
				"range2*",
				"range",
				"Second range to evaluate"
			],
			[
				"...",
				"any",
				"Additional criteria for additional ranges"
			]
		],
		description: "Counts cells that meet multiple conditions simultaneously. Use it when you need to count records matching two or more filters at once.",
		examples: ["=COUNTIFS(B2:B100, \"West\", C2:C100, \">1000\") counts rows where region is West and sales exceed 1000."]
	},
	coupdaybs: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the number of days from the start of the current coupon period to the settlement date. This is the span the seller has already earned interest over, so it drives the accrued interest a buyer must pay on top of the price.",
		examples: ["=COUPDAYBS(A2, B2, 2, 0) returns the days elapsed in the coupon period at settlement."]
	},
	coupdays: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the total number of days in the coupon period that contains the settlement date. It is the denominator when working out what fraction of a coupon has accrued, so COUPDAYBS divided by COUPDAYS gives the share the seller has earned.",
		examples: ["=COUPDAYS(A2, B2, 2, 0) returns 180 for a semiannual bond on a 30/360 basis."]
	},
	coupdaysnc: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the number of days from the settlement date to the next coupon date. It tells a buyer how long they must wait for the first interest payment, and completes the coupon period alongside COUPDAYBS.",
		examples: ["=COUPDAYSNC(A2, B2, 2, 0) returns the days remaining until the next coupon is paid."]
	},
	coupncd: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention; accepted but not used"
			]
		],
		description: "Returns the first coupon date falling after the settlement date, counting back from maturity at the given frequency. The result is a serial number, so format the cell as a date to read it.",
		examples: ["=COUPNCD(A2, B2, 2) returns the date of the next coupon payment after settlement."]
	},
	coupnum: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention; accepted but not used"
			]
		],
		description: "Returns how many coupon payments are still due between settlement and maturity, counting the next one and rounding up to a whole coupon. Use it to size a bond's remaining cash flows.",
		examples: ["=COUPNUM(A2, B2, 2) returns 10 for a semiannual bond with five years left to run."]
	},
	couppcd: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention; accepted but not used"
			]
		],
		description: "Returns the most recent coupon date at or before the settlement date, the point from which interest has been accruing to the seller. The result is a serial number, so format the cell as a date to read it.",
		examples: ["=COUPPCD(A2, B2, 2) returns the date of the last coupon paid before settlement."]
	},
	covar: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"array1",
			"number_or_range",
			"First dataset"
		], [
			"array2",
			"number_or_range",
			"Second dataset, same size as array1"
		]],
		description: "Compatibility name for COVARIANCE.P (population covariance). Prefer COVARIANCE.P in new formulas.",
		examples: ["=COVAR(A2:A10, B2:B10) is equivalent to =COVARIANCE.P(A2:A10, B2:B10)."]
	},
	"covariance.p": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array1",
			"number_or_range",
			"First dataset (the full population)"
		], [
			"array2",
			"number_or_range",
			"Second dataset, same size as array1"
		]],
		description: "Returns the population covariance of two datasets - a measure of how much they vary together. Use it in finance and statistics to quantify the relationship between two variables when you have the entire population.",
		examples: ["=COVARIANCE.P(A2:A100, B2:B100)."]
	},
	"covariance.s": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array1",
			"number_or_range",
			"First dataset (a sample)"
		], [
			"array2",
			"number_or_range",
			"Second dataset, same size as array1"
		]],
		description: "Returns the sample covariance, dividing by n−1 instead of n - appropriate when your data is a sample rather than the full population. Use it alongside CORREL or as a building block for more advanced statistical analysis.",
		examples: ["=COVARIANCE.S(A2:A50, B2:B50)."]
	},
	critbinom: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"trials",
				"integer",
				"Number of Bernoulli trials"
			],
			[
				"probability_s",
				"number",
				"Probability of success on each trial"
			],
			[
				"alpha",
				"number",
				"Criterion value between 0 and 1"
			]
		],
		description: "Compatibility name for BINOM.INV. Returns the smallest value for which the cumulative binomial distribution is greater than or equal to alpha. Prefer BINOM.INV in new formulas.",
		examples: ["=CRITBINOM(10, 0.5, 0.75) is equivalent to =BINOM.INV(10, 0.5, 0.75)."]
	},
	csc: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Angle in radians; cannot be a multiple of π"
		]],
		description: "Returns the cosecant of an angle in radians (1 divided by sine). Used in trigonometry where the reciprocal of sine is needed.",
		examples: ["=CSC(PI()/2) returns 1."]
	},
	csch: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Non-zero real number"
		]],
		description: "Returns the hyperbolic cosecant of a number. Appears in advanced mathematics and physics.",
		examples: ["=CSCH(1) returns approximately 0.851."]
	},
	cumipmt: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"nper",
				"integer",
				"Total number of payment periods"
			],
			[
				"pv",
				"number",
				"Present value of the loan"
			],
			[
				"start_period",
				"integer",
				"First period to include in the sum (1-based)"
			],
			[
				"end_period",
				"integer",
				"Last period to include in the sum"
			],
			[
				"type",
				"integer",
				"0 for end-of-period payments; 1 for beginning-of-period"
			]
		],
		description: "Returns the cumulative interest paid on a loan between two payment periods. Use it to find out how much total interest you paid during a specific part of a loan - for instance, during year two of a five-year mortgage.",
		examples: ["=CUMIPMT(rate, nper, pv, start_period, end_period, type) returns the total interest over that span."]
	},
	cumprinc: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"nper",
				"integer",
				"Total payment periods"
			],
			[
				"pv",
				"number",
				"Present value of the loan"
			],
			[
				"start_period",
				"integer",
				"First period to include (1-based)"
			],
			[
				"end_period",
				"integer",
				"Last period to include"
			],
			[
				"type",
				"integer",
				"0 for end-of-period payments; 1 for beginning-of-period"
			]
		],
		description: "Returns the cumulative principal paid on a loan between two periods. Use it alongside CUMIPMT to understand what portion of your payments reduced the balance during a given window.",
		examples: ["=CUMPRINC(rate, nper, pv, 13, 24, 0) returns principal paid in months 13 through 24."]
	},
	date: {
		tier: 0,
		category: 2,
		tags: [],
		args: [
			[
				"year",
				"integer",
				"Four-digit year number"
			],
			[
				"month*",
				"integer",
				"Month number (1-12); values outside this range roll over to adjacent months"
			],
			[
				"...",
				"integer",
				"Day number; values outside the valid range roll over similarly"
			]
		],
		description: "Creates a proper date value from separate year, month, and day numbers. Use it when you need to assemble a date from components stored in different cells - for instance, building a due date from a year column, a month column, and a day column.",
		examples: ["=DATE(2025, 12, 31) returns December 31, 2025."]
	},
	datedif: {
		tier: 0,
		category: 2,
		tags: [],
		args: [
			[
				"start_date",
				"date",
				"Earlier date of the range"
			],
			[
				"end_date",
				"date",
				"Later date of the range"
			],
			[
				"unit",
				"text",
				"Interval to measure: \"Y\" years, \"M\" months, \"D\" days, \"MD\" days ignoring months, \"YM\" months ignoring years, \"YD\" days ignoring years"
			]
		],
		description: "Calculates the difference between two dates in the unit you specify - years, months, or days. Use it most often to calculate someone's age in complete years, or the number of complete months between two events.",
		examples: ["=DATEDIF(B2, TODAY(), \"Y\") returns a person's age in whole years."]
	},
	datevalue: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"date_text",
			"text",
			"Date expressed as a recognisable text string, e.g. \"Jan 15, 2025\""
		]],
		description: "Converts a date stored as text (such as \"January 15, 2025\") into a numeric date serial that Excel can sort and calculate with. Use it when importing data where dates arrived as text strings.",
		examples: ["=DATEVALUE(\"2025-01-15\") returns the serial number for that date."]
	},
	daverage: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full range including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column header name or 1-based column index"
			],
			[
				"criteria",
				"range",
				"Range specifying the filter conditions"
			]
		],
		description: "Average of values in a database (range with row headers) that match the criteria.",
		examples: ["=DAVERAGE(A1:D100, \"Sales\", F1:F2) Average of values in the column 'Sales' satisfying the criteria in F1:F2."]
	},
	day: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"date",
			"date",
			"Date value from which to extract the day number (1-31)"
		]],
		description: "Extracts the day of the month (1–31) from a date value. Use it to isolate the day component - for example, to check whether a transaction occurred in the first or second half of the month.",
		examples: ["=DAY(A2) returns 15 if A2 contains January 15, 2025."]
	},
	days: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"end_date",
			"date",
			"The later date"
		], [
			"start_date",
			"date",
			"The earlier date"
		]],
		description: "Returns the number of days between two dates. Use it for simple deadline calculations or duration tracking - it's just a more readable way to subtract two dates.",
		examples: ["=DAYS(B2, A2) returns how many days elapsed between the date in A2 and the date in B2."]
	},
	days360: {
		tier: 0,
		category: 2,
		tags: [],
		args: [
			[
				"start_date",
				"date",
				"Start of the period"
			],
			[
				"end_date",
				"date",
				"End of the period"
			],
			[
				"method*",
				"logical",
				"FALSE or omitted for the US convention; TRUE for the European convention"
			]
		],
		description: "Calculates the number of days between two dates using a 360-day year (twelve 30-day months). Use it for financial calculations - such as interest accrual - that follow a 30/360 day-count convention.",
		examples: ["=DAYS360(A2, B2) returns the day count under the 30/360 assumption."]
	},
	db: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"cost",
				"number",
				"Initial cost of the asset"
			],
			[
				"salvage",
				"number",
				"Residual value at the end of its life"
			],
			[
				"life",
				"integer",
				"Number of periods in the asset's useful life"
			],
			[
				"period",
				"integer",
				"Period to calculate depreciation for"
			],
			[
				"month*",
				"integer",
				"Months in the first year; defaults to 12"
			]
		],
		description: "Returns the depreciation of an asset for a given period using the fixed-declining-balance method. Use it when accounting rules require declining-balance depreciation - common for machinery, vehicles, and equipment.",
		examples: ["=DB(cost, salvage, life, period) returns the depreciation charge for that period."]
	},
	dcount: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full range including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column to count, by header name or 1-based index"
			],
			[
				"criteria",
				"range",
				"Range specifying the filter conditions"
			]
		],
		description: "Counts the cells containing numbers in a database that match the criteria.",
		examples: ["=DCOUNT(A1:D50, \"Salary\", G1:G2) counts rows with numeric salaries matching your criteria."]
	},
	dcounta: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full range including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column to count non-empty entries in"
			],
			[
				"criteria",
				"range",
				"Range specifying the filter conditions"
			]
		],
		description: "Counts all non-empty cells in a database column that match the criteria - including text entries. Use it instead of DCOUNT when the column you're counting contains text, such as names or status codes.",
		examples: ["=DCOUNTA(A1:D50, \"Name\", G1:G2) counts all non-blank name entries matching your filter."]
	},
	ddb: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"cost",
				"number",
				"Initial cost of the asset"
			],
			[
				"salvage",
				"number",
				"Residual value at end of useful life"
			],
			[
				"life",
				"integer",
				"Number of periods in the asset's useful life"
			],
			[
				"period",
				"integer",
				"Period to calculate depreciation for"
			],
			[
				"factor*",
				"number",
				"Depreciation rate multiplier; defaults to 2 for double-declining balance"
			]
		],
		description: "Calculates depreciation using the double-declining-balance method (or any other factor you specify). Use it for assets that lose value faster in early years - it produces higher charges at the start and lower amounts later.",
		examples: ["=DDB(cost, salvage, life, period, 2) applies double the straight-line rate."]
	},
	dec2bin: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"integer",
			"Decimal value to convert; must be between -512 and 511"
		], [
			"places*",
			"integer",
			"Minimum width of the result, padded with leading zeros"
		]],
		description: "Converts a decimal integer to binary. Use it to translate regular numbers into binary format for digital logic work or data encoding.",
		examples: ["=DEC2BIN(10) returns \"1010\"."]
	},
	dec2hex: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"integer",
			"Decimal value to convert"
		], [
			"places*",
			"integer",
			"Minimum width of the result, padded with leading zeros"
		]],
		description: "Converts a decimal integer to hexadecimal. Use it when working with memory addresses, color codes, or any system that uses hex notation.",
		examples: ["=DEC2HEX(255) returns \"FF\"."]
	},
	dec2oct: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"integer",
			"Decimal value to convert; must be between -536870912 and 536870911"
		], [
			"places*",
			"integer",
			"Minimum width of the result, padded with leading zeros"
		]],
		description: "Converts a decimal integer to octal (base 8). Useful in Unix/Linux contexts where file permissions and other values use octal notation.",
		examples: ["=DEC2OCT(8) returns \"10\"."]
	},
	decimal: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"text",
			"String representation of the number in the given base"
		], [
			"radix",
			"integer",
			"Base of the input number, between 2 and 36"
		]],
		description: "Converts a text representation of a number in a given base into its decimal equivalent. Use it when you have numbers in binary, octal, or hexadecimal stored as text and need a decimal number to calculate with.",
		examples: ["=DECIMAL(\"FF\", 16) returns 255; =DECIMAL(\"1010\", 2) returns 10."]
	},
	degrees: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"angle",
			"number",
			"Angle in radians to convert to degrees"
		]],
		description: "Converts an angle from radians to degrees. Use it after trigonometric functions that return results in radians when you want the angle expressed in degrees for display or further calculation.",
		examples: ["=DEGREES(PI()) returns 180."]
	},
	delta: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number1",
			"number",
			"First value"
		], [
			"number2*",
			"number",
			"Second value to compare against; defaults to 0"
		]],
		description: "Tests whether two numbers are equal, returning 1 if they are and 0 otherwise - the Kronecker delta function. Use it as a compact equality check whose result can be used directly in arithmetic.",
		examples: ["=DELTA(5, 5) returns 1; =DELTA(5, 6) returns 0."]
	},
	devsq: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the sum of squared deviations from the mean for a dataset: Σ(xᵢ−x̄)². Use it as an intermediate step in variance or regression calculations.",
		examples: ["=DEVSQ(A2:A20)."]
	},
	dget: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full range including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column header name or 1-based column index"
			],
			[
				"criteria",
				"range",
				"Range specifying the filter conditions"
			]
		],
		description: "Single value from a database column that matches the specified criteria, returning an error if more than one row matches.",
		examples: ["=DGET(A1:D50, \"Phone\", G1:G2) returns the phone number of the one employee matching your criteria."]
	},
	disc: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"pr",
				"number",
				"Price per $100 face value"
			],
			[
				"redemption",
				"number",
				"Redemption value per $100 face value"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the discount rate for a security — the annualised spread between its purchase price and redemption value.",
		examples: ["=DISC(A2, B2, 97.5, 100, 0) returns the discount rate for a T-bill."]
	},
	dmax: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full table including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column to find the maximum in"
			],
			[
				"criteria",
				"range",
				"Criteria range with a header and a condition"
			]
		],
		description: "Returns the largest value in a database column that meets the given criteria. Use it to find the highest figure in a filtered subset - for example, the maximum sale amount for a specific product category.",
		examples: ["=DMAX(A1:D100, \"Amount\", F1:F2) returns the largest matching sale."]
	},
	dmin: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full table including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column to find the minimum in"
			],
			[
				"criteria",
				"range",
				"Criteria range with a header and a condition"
			]
		],
		description: "Returns the smallest value in a database column that meets the given criteria. Use it to find the lowest recorded value in a filtered set - the counterpart of DMAX.",
		examples: ["=DMIN(A1:D100, \"Amount\", F1:F2) returns the smallest matching sale."]
	},
	dollar: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to format as a currency text string"
		], [
			"decimals",
			"integer",
			"Number of decimal places; negative rounds left of the decimal point"
		]],
		description: "Converts a number to text formatted as currency, with a specified number of decimal places and a dollar sign. Use it to embed a formatted currency value inside a text string - for example, in a generated message.",
		examples: ["=DOLLAR(1234.5, 2) returns \"$1,234.50\"."]
	},
	dollarde: {
		tier: 0,
		category: 4,
		tags: [],
		args: [[
			"fractional_dollar",
			"number",
			"Price in the form integer.fraction, e.g. 1.02 means 1 and 2/n"
		], [
			"fraction",
			"integer",
			"Denominator of the fractional part"
		]],
		description: "Converts a price expressed in fractional dollar notation (as used in bond markets, e.g., 1.02 meaning 1 and 2/32) to a decimal price. Use it when your data comes from markets that quote in fractional form.",
		examples: ["=DOLLARDE(1.02, 32) returns 1.0625."]
	},
	dollarfr: {
		tier: 0,
		category: 4,
		tags: [],
		args: [[
			"decimal_dollar",
			"number",
			"Standard decimal price to convert"
		], [
			"fraction",
			"integer",
			"Denominator to use in the fractional representation"
		]],
		description: "Converts a decimal price back to fractional dollar notation. The reverse of DOLLARDE - use it when you need to display a price in the market's native fractional format.",
		examples: ["=DOLLARFR(1.0625, 32) returns 1.02 (meaning 1 and 2/32)."]
	},
	dproduct: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full table including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column whose values to multiply"
			],
			[
				"criteria",
				"range",
				"Criteria range with a header and a condition"
			]
		],
		description: "Multiplies all values in a database column that match the criteria and returns the result. Use it when you need a running product over a filtered subset of numbers - a rare but occasionally necessary calculation in scientific or financial models.",
		examples: ["=DPRODUCT(A1:D20, \"Factor\", G1:G2) multiplies all factor values that match the conditions."]
	},
	drop: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Source array"
			],
			[
				"rows",
				"integer",
				"Rows to drop from the top; negative drops from the bottom"
			],
			[
				"...",
				"integer",
				"Columns to drop from the left; negative drops from the right"
			]
		],
		description: "Removes a specified number of rows or columns from the start or end of an array. Use it to skip header rows or to trim trailing rows from a returned range before using it in further calculations.",
		examples: ["=DROP(A1:D10, 1) removes the first row; =DROP(A1:D10, -2) removes the last two rows."]
	},
	dstdev: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full table including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column to measure, by header name or 1-based index"
			],
			[
				"criteria",
				"range",
				"Criteria range with a header and a condition"
			]
		],
		description: "Estimates the standard deviation of values in a database column matching the criteria, treating the matching rows as a sample. Use it to measure the spread of a filtered subset of data.",
		examples: ["=DSTDEV(A1:D100, \"Score\", F1:F2) estimates the variability of scores in the matched group."]
	},
	dstdevp: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full table including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column to measure, treating matches as the whole population"
			],
			[
				"criteria",
				"range",
				"Criteria range with a header and a condition"
			]
		],
		description: "Like DSTDEV, but treats the filtered rows as the entire population rather than a sample. Use it when the matching records represent the complete group, not just a portion of it.",
		examples: ["=DSTDEVP(A1:D100, \"Score\", F1:F2)."]
	},
	dsum: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full table including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column to sum, by header name or 1-based index"
			],
			[
				"criteria",
				"range",
				"Criteria range with a header and a condition"
			]
		],
		description: "Adds up all values in a database column that match the specified criteria. A classic use case is totaling sales for a particular product or region within a larger table.",
		examples: ["=DSUM(A1:D100, \"Revenue\", F1:F2) sums all revenue rows where the criteria are met."]
	},
	duration: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"coupon",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"yld",
				"number",
				"Annual yield as a decimal"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the Macaulay duration of a bond paying periodic interest: the weighted-average time in years until its cash flows are received. Use it to compare how sensitive different bonds are to a change in interest rates.",
		examples: ["=DURATION(A2, B2, 0.05, 0.04, 2, 0) returns the duration in years of a semiannual bond."]
	},
	dvar: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full table including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column to measure, treating matches as a sample"
			],
			[
				"criteria",
				"range",
				"Criteria range with a header and a condition"
			]
		],
		description: "Estimates the variance of values in a database column matching the criteria, treating the result as a sample. Variance measures how spread out values are; DVAR gives you that for a filtered subset.",
		examples: ["=DVAR(A1:D100, \"Score\", G1:G2)."]
	},
	dvarp: {
		tier: 0,
		category: 1,
		tags: [],
		args: [
			[
				"database",
				"range",
				"Full table including its header row"
			],
			[
				"field",
				"text_or_integer",
				"Column to measure, treating matches as the whole population"
			],
			[
				"criteria",
				"range",
				"Criteria range with a header and a condition"
			]
		],
		description: "Like DVAR, but assumes the matched records represent the whole population rather than a sample. Use it when your filter captures every relevant record.",
		examples: ["=DVARP(A1:D100, \"Score\", G1:G2)."]
	},
	edate: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"start_date",
			"date",
			"Starting date"
		], [
			"...",
			"integer",
			"Months to offset; positive moves forward, negative moves back"
		]],
		description: "Returns the date that is a specified number of months before or after a start date, landing on the same day of the month. Use it to calculate subscription renewals, installment due dates, or contract end dates.",
		examples: ["=EDATE(A2, 6) returns the date six months after the date in A2."]
	},
	effect: {
		tier: 0,
		category: 4,
		tags: [],
		args: [[
			"nominal_rate",
			"number",
			"Annual nominal interest rate as a decimal"
		], [
			"npery",
			"integer",
			"Number of compounding periods per year"
		]],
		description: "Returns the effective annual interest rate given a nominal rate and the number of compounding periods per year. Use it to compare loan or investment products that compound at different frequencies - daily compounding at 5% is not the same as annual 5%.",
		examples: ["=EFFECT(0.05, 12) returns the effective rate with monthly compounding."]
	},
	eomonth: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"start_date",
			"date",
			"Reference date"
		], [
			"...",
			"integer",
			"Months to offset; 0 returns the last day of start_date's own month"
		]],
		description: "Returns the last day of the month a given number of months before or after a start date. Use it to generate month-end reporting dates or to find when a monthly period closes.",
		examples: ["=EOMONTH(A2, 0) returns the last day of the month containing A2; =EOMONTH(A2, 1) returns the last day of the following month."]
	},
	erf: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"lower_limit",
			"number",
			"The lower bound for integrating the error function"
		], [
			"upper_limit*",
			"number",
			"The upper bound; if omitted, integrates between 0 and lower_limit"
		]],
		description: "Returns the error function integrated between 0 and a given value, or between two limits. Used in statistics and physics for normal distribution calculations and diffusion problems.",
		examples: ["=ERF(1) returns approximately 0.8427."]
	},
	"erf.precise": {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"x",
			"number",
			"The value up to which to integrate the error function"
		]],
		description: "A single-argument version of ERF that always integrates from 0 to the given upper limit, with higher numerical precision. Use it when you need the standard error function with more accuracy.",
		examples: ["=ERF.PRECISE(1) returns approximately 0.8427."]
	},
	erfc: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"x",
			"number",
			"The lower bound for integrating the complementary error function"
		]],
		description: "Returns the complementary error function: 1 minus ERF. Use it when you need the probability that a value lies beyond a threshold in a normal distribution context.",
		examples: ["=ERFC(1) returns approximately 0.1573."]
	},
	"erfc.precise": {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"x",
			"number",
			"The lower bound for integrating the complementary error function"
		]],
		description: "A higher-precision version of ERFC. Use it in scientific and engineering applications where numerical accuracy is critical.",
		examples: ["=ERFC.PRECISE(1) returns approximately 0.1573."]
	},
	"error.type": {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"error_val",
			"any",
			"The error value to identify; usually a reference to a cell that may contain an error"
		]],
		description: "Returns a number corresponding to the type of error in a cell (1 for #NULL!, 2 for #DIV/0!, etc.). Use it inside error-handling formulas to take different actions depending on which error occurred.",
		examples: ["=ERROR.TYPE(A2) returns 2 if A2 contains #DIV/0!."]
	},
	even: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round up to the nearest even integer"
		]],
		description: "Rounds a number up to the nearest even integer. Use it when you need to ensure a quantity is even - for instance, packaging items that must come in pairs.",
		examples: ["=EVEN(3) returns 4; =EVEN(-3) returns -4."]
	},
	exact: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text1",
			"text",
			"First string (comparison is case-sensitive)"
		], [
			"text2",
			"text",
			"Second string to compare against"
		]],
		description: "Compares two text strings and returns TRUE only if they are character-for-character identical, including case. Use it when case-sensitivity matters - \"Apple\" and \"apple\" are not equal under EXACT even though = treats them as the same.",
		examples: ["=EXACT(\"Apple\", \"apple\") returns FALSE."]
	},
	exp: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Exponent to raise the mathematical constant e to"
		]],
		description: "Returns e (Euler's number ≈ 2.71828) raised to the power of a given number. Use it for exponential growth and decay models, as the inverse of LN, or in any formula involving the mathematical constant e.",
		examples: ["=EXP(1) returns e; =EXP(LN(x)) returns x."]
	},
	expand: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Source array to expand"
			],
			[
				"rows",
				"integer",
				"Target number of rows"
			],
			[
				"columns*",
				"integer",
				"Target number of columns"
			],
			[
				"...",
				"any",
				"Value to fill the added cells with; defaults to #N/A"
			]
		],
		description: "Expands an array to a specified number of rows and columns, filling new cells with a pad value (default #N/A). Use it to ensure an array has a consistent size before combining it with other arrays of fixed dimensions.",
		examples: ["=EXPAND(A1:B3, 5, 3, 0) extends the range to 5 rows and 3 columns, padding with 0."]
	},
	"expon.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Non-negative value to evaluate"
			],
			[
				"lambda",
				"number",
				"Rate parameter (must be positive)"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution; FALSE for the probability density"
			]
		],
		description: "Returns the exponential distribution probability - either the cumulative or probability density. Use it to model the time between events in a Poisson process, such as the probability that a customer arrives within the next minute.",
		examples: ["=EXPON.DIST(2, 0.5, TRUE) returns the cumulative probability."]
	},
	expondist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value to evaluate (non-negative)"
			],
			[
				"lambda",
				"number",
				"Rate parameter (must be positive)"
			],
			[
				"cumulative",
				"logical",
				"TRUE for cumulative distribution; FALSE for probability density"
			]
		],
		description: "Compatibility name for EXPON.DIST. Prefer EXPON.DIST in new formulas.",
		examples: ["=EXPONDIST(0.2, 10, TRUE) is equivalent to =EXPON.DIST(0.2, 10, TRUE)."]
	},
	"f.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"The value at which to evaluate the function"
			],
			[
				"deg_freedom1",
				"integer",
				"The numerator degrees of freedom"
			],
			[
				"deg_freedom2",
				"integer",
				"The denominator degrees of freedom"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution function; FALSE for the probability density function"
			]
		],
		description: "Returns the F-distribution probability (left-tailed CDF or PDF). Use it in ANOVA and regression analysis when evaluating variance ratios.",
		examples: ["=F.DIST(2.5, 5, 10, TRUE) returns the left-tail probability for an F-statistic of 2.5."]
	},
	"f.dist.rt": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"The value at which to evaluate the function"
			],
			[
				"deg_freedom1",
				"integer",
				"The numerator degrees of freedom"
			],
			[
				"deg_freedom2",
				"integer",
				"The denominator degrees of freedom"
			]
		],
		description: "Returns the right-tailed F-distribution probability. Use it to find the p-value for an F-test - values near 0 indicate that the variances are significantly different.",
		examples: ["=F.DIST.RT(2.5, 5, 10) returns the right-tail p-value."]
	},
	"f.inv": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Left-tail probability between 0 and 1 associated with the F cumulative distribution"
			],
			[
				"deg_freedom1",
				"integer",
				"The numerator degrees of freedom"
			],
			[
				"deg_freedom2",
				"integer",
				"The denominator degrees of freedom"
			]
		],
		description: "Returns the inverse of the left-tailed F-distribution - the F-value at which the CDF equals a given probability. Use it to find critical values for F-tests or to construct F-distribution confidence intervals.",
		examples: ["=F.INV(0.95, 5, 10) returns the 95th-percentile F-value."]
	},
	"f.inv.rt": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Right-tail probability between 0 and 1 associated with the F cumulative distribution"
			],
			[
				"deg_freedom1",
				"integer",
				"The numerator degrees of freedom"
			],
			[
				"deg_freedom2",
				"integer",
				"The denominator degrees of freedom"
			]
		],
		description: "Returns the inverse of the right-tailed F-distribution. Use it to find the critical F-value at a given significance level for an F-test.",
		examples: ["=F.INV.RT(0.05, 5, 10) returns the critical value at the 5% level."]
	},
	"f.test": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array1",
			"range",
			"The first array or range of data"
		], [
			"array2",
			"range",
			"The second array or range of data"
		]],
		description: "Returns the p-value for an F-test comparing the variances of two datasets. Use it to determine whether two groups have significantly different variability before applying certain other statistical tests.",
		examples: ["=F.TEST(A2:A20, B2:B20) returns the two-tailed p-value."]
	},
	fact: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"integer",
			"Non-negative integer whose factorial you want"
		]],
		description: "Returns the factorial of a non-negative integer (n! = 1 × 2 × … × n). Use it in combinatorics to count the number of ways to arrange items, or in probability formulas that require factorials.",
		examples: ["=FACT(5) returns 120."]
	},
	factdouble: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"integer",
			"Value for which to compute the double factorial (n!!)"
		]],
		description: "Returns the double factorial of a number (n!! = n × (n−2) × (n−4) × … down to 1 or 2). Used in combinatorics and probability, particularly with Gaussian integrals and binomial series.",
		examples: ["=FACTDOUBLE(7) returns 105 (7×5×3×1)."]
	},
	false: {
		tier: 0,
		category: 6,
		tags: [],
		args: [],
		description: "Returns the logical value FALSE. Use it in formulas that require a literal FALSE as a function argument - for instance, as the match_type parameter in VLOOKUP to force an exact match.",
		examples: ["=VLOOKUP(A2, B:C, 2, FALSE) performs an exact lookup."]
	},
	fdist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value to evaluate (non-negative)"
			],
			[
				"degrees_freedom1",
				"integer",
				"Numerator degrees of freedom"
			],
			[
				"degrees_freedom2",
				"integer",
				"Denominator degrees of freedom"
			]
		],
		description: "Compatibility name for F.DIST.RT (right-tail F-distribution). Prefer F.DIST.RT in new formulas.",
		examples: ["=FDIST(3, 5, 10) is equivalent to =F.DIST.RT(3, 5, 10)."]
	},
	filter: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Array or range to filter"
			],
			[
				"include",
				"logical_array",
				"Boolean array of the same height (or width) indicating which rows (or columns) to keep"
			],
			[
				"...",
				"any",
				"Value to return when every row is filtered out; omitting causes a #CALC! error"
			]
		],
		description: "Returns only the rows (or columns) from a range that meet a specified condition. Use it instead of AutoFilter when you want filtered results to spill directly into formulas - the output updates automatically as data changes.",
		examples: ["=FILTER(A2:D100, C2:C100=\"West\") returns all rows where column C is \"West\"."]
	},
	find: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"find_text",
				"text",
				"Substring to locate (case-sensitive, no wildcards)"
			],
			[
				"within_text",
				"text",
				"String to search inside"
			],
			[
				"start_num",
				"integer",
				"1-based character position to start the search from"
			]
		],
		description: "Returns the position of one text string within another, case-sensitively. Use it to locate exactly where a substring begins - then combine with MID or LEFT to extract the relevant portion.",
		examples: ["=FIND(\"@\", A2) returns the position of the \"@\" in an email address."]
	},
	findb: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"find_text",
				"text",
				"Substring to locate (case-sensitive, no wildcards)"
			],
			[
				"within_text",
				"text",
				"String to search inside"
			],
			[
				"start_num*",
				"integer",
				"1-based character position to start the search from; defaults to 1"
			]
		],
		description: "Finds the position of one text string within another, case-sensitively. Equivalent to FIND; provided for compatibility with double-byte (East Asian) locales.",
		examples: ["=FINDB(\"A\", A2) returns the position of \"A\"."]
	},
	finv: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Right-tail probability between 0 and 1"
			],
			[
				"degrees_freedom1",
				"integer",
				"Numerator degrees of freedom"
			],
			[
				"degrees_freedom2",
				"integer",
				"Denominator degrees of freedom"
			]
		],
		description: "Compatibility name for F.INV.RT. Prefer F.INV.RT in new formulas.",
		examples: ["=FINV(0.05, 5, 10) is equivalent to =F.INV.RT(0.05, 5, 10)."]
	},
	fisher: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"x",
			"number",
			"The value to transform; must be greater than -1 and less than 1"
		]],
		description: "Returns the Fisher transformation of a correlation coefficient r, converting it to a value with approximately normal distribution. Use it to construct confidence intervals for r or to test whether two correlations are significantly different.",
		examples: ["=FISHER(0.8) returns approximately 1.099."]
	},
	fisherinv: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"y",
			"number",
			"The value for which to perform the inverse of the transformation"
		]],
		description: "Returns the inverse of the Fisher transformation - converts a Fisher z-value back to a correlation coefficient. Use it after computing confidence intervals in z-space to report results as r-values.",
		examples: ["=FISHERINV(1.099) returns approximately 0.8."]
	},
	fixed: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"number",
				"number",
				"Value to format as text"
			],
			[
				"decimals*",
				"integer",
				"Decimal places to show; defaults to 2"
			],
			[
				"no_commas",
				"logical",
				"TRUE to suppress the thousands separator"
			]
		],
		description: "Rounds a number to a specified number of decimal places and returns it as formatted text, optionally with thousands separators. Use it to embed a formatted number inside a text formula without changing the cell's number format.",
		examples: ["=FIXED(1234567.89, 2) returns \"1,234,567.89\"."]
	},
	floor: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round down"
		], [
			"significance",
			"number",
			"Multiple to round down to"
		]],
		description: "Rounds a number down to the nearest multiple of a significance value. Use it when you always want to round down to a specific increment - for example, discarding partial hours when computing billable time.",
		examples: ["=FLOOR(4.7, 0.5) returns 4.5."]
	},
	"floor.math": {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"number",
				"number",
				"Value to round down"
			],
			[
				"significance*",
				"number",
				"Rounding multiple; defaults to 1"
			],
			[
				"mode*",
				"integer",
				"0 rounds negative numbers toward negative infinity; 1 rounds them toward zero"
			]
		],
		description: "Rounds a number down to the nearest multiple of significance, with a mode argument controlling behavior for negative numbers. More flexible than FLOOR when you need consistent rounding across positive and negative values.",
		examples: ["=FLOOR.MATH(-4.7, 1) returns -5 (away from zero by default)."]
	},
	"floor.precise": {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round down"
		], [
			"significance*",
			"number",
			"Multiple to round down to; always rounds toward negative infinity"
		]],
		description: "Rounds a number down toward negative infinity to the nearest multiple of significance, regardless of sign. Use it for consistent rounding direction across both positive and negative numbers.",
		examples: ["=FLOOR.PRECISE(-4.3, 1) returns -5."]
	},
	forecast: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"The data point whose value you want to predict"
			],
			[
				"known_ys",
				"number_or_range",
				"The dependent data series"
			],
			[
				"known_xs",
				"number_or_range",
				"The independent data series"
			]
		],
		description: "Predicts a future value along a linear trend fitted to existing data. Equivalent to FORECAST.LINEAR.",
		examples: ["=FORECAST(13, B2:B10, A2:A10) predicts the y-value at x=13."]
	},
	"forecast.linear": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"The data point whose value you want to predict"
			],
			[
				"known_ys",
				"number_or_range",
				"The dependent data series"
			],
			[
				"known_xs",
				"number_or_range",
				"The independent data series"
			]
		],
		description: "Predicts a future value by fitting a straight line through existing x/y pairs using least squares regression.",
		examples: ["=FORECAST.LINEAR(13, B2:B10, A2:A10) predicts the y-value at x=13."]
	},
	formulatext: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"reference",
			"reference",
			"Cell containing the formula you want to see as text"
		]],
		description: "Returns the formula in a referenced cell as a text string. Use it to display or audit formulas - for example, to show the formula alongside its result in a report.",
		examples: ["=FORMULATEXT(B2) returns the text of whatever formula is in B2."]
	},
	frequency: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"data_array",
			"range",
			"Values to count into bins"
		], [
			"bins_array",
			"range",
			"Upper boundary of each bin; must be sorted ascending"
		]],
		description: "Returns a vertical array of counts showing how many values fall into each of the specified bins. Returns one more element than bins_array to catch values above the highest bin.",
		examples: ["=FREQUENCY(A2:A20, C2:C5) counts scores into bands defined by C2:C5."]
	},
	ftest: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"array1",
			"number_or_range",
			"First dataset"
		], [
			"array2",
			"number_or_range",
			"Second dataset"
		]],
		description: "Compatibility name for F.TEST. Prefer F.TEST in new formulas.",
		examples: ["=FTEST(A2:A10, B2:B10) is equivalent to =F.TEST(A2:A10, B2:B10)."]
	},
	fv: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"nper",
				"integer",
				"Total number of payment periods"
			],
			[
				"pmt",
				"number",
				"Fixed payment made each period"
			],
			[
				"pv*",
				"number",
				"Present value (lump sum at the start); defaults to 0"
			],
			[
				"type*",
				"integer",
				"0 for end-of-period payments; 1 for beginning-of-period"
			]
		],
		description: "Calculates the future value of an investment based on regular payments and a constant interest rate. Use it to project how much money you'll have after making regular contributions - like a retirement savings plan.",
		examples: ["=FV(rate, nper, pmt) returns the total amount accumulated."]
	},
	fvschedule: {
		tier: 0,
		category: 4,
		tags: [],
		args: [[
			"principal",
			"number",
			"Starting value of the investment"
		], [
			"schedule",
			"range",
			"Array of interest rates to apply in successive periods"
		]],
		description: "Returns the future value of an initial principal after applying a schedule of variable interest rates — useful for modelling adjustable-rate loans or investments.",
		examples: ["=FVSCHEDULE(1000, {0.05, 0.04, 0.06}) compounds 1000 over three years at different rates."]
	},
	gamma: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number",
			"number",
			"Positive real number (non-integer negatives are also accepted)"
		]],
		description: "Returns the value of the gamma function Γ(x), which extends the factorial to non-integer values (Γ(n) = (n-1)! for positive integers). Use it in advanced probability and statistics.",
		examples: ["=GAMMA(5) returns 24 (= 4!)."]
	},
	"gamma.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Non-negative value to evaluate"
			],
			[
				"alpha",
				"number",
				"Shape parameter (must be positive)"
			],
			[
				"beta",
				"number",
				"Scale parameter (must be positive)"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution; FALSE for the probability density"
			]
		],
		description: "Returns the gamma distribution probability (CDF or PDF). Use it to model waiting times and other positive-valued data.",
		examples: ["=GAMMA.DIST(2, 2, 1, TRUE) returns the cumulative probability."]
	},
	"gamma.inv": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Probability between 0 and 1 exclusive"
			],
			[
				"alpha",
				"number",
				"Shape parameter of the gamma distribution"
			],
			[
				"beta",
				"number",
				"Scale parameter of the gamma distribution"
			]
		],
		description: "Returns the inverse of the gamma cumulative distribution - the value at which the CDF equals a given probability. Use it for quantile calculations with gamma-distributed data.",
		examples: ["=GAMMA.INV(0.95, 2, 1) returns the 95th percentile."]
	},
	gammadist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Non-negative value to evaluate"
			],
			[
				"alpha",
				"number",
				"Shape parameter"
			],
			[
				"beta",
				"number",
				"Scale parameter"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution; FALSE for the probability density"
			]
		],
		description: "Returns the gamma distribution probability - an older function name for what is now GAMMA.DIST. Use it to model waiting times or other positive-valued data following a gamma distribution.",
		examples: ["=GAMMADIST(2, 2, 1, TRUE) returns the cumulative probability."]
	},
	gammainv: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Probability between 0 and 1 exclusive"
			],
			[
				"alpha",
				"number",
				"Shape parameter"
			],
			[
				"beta",
				"number",
				"Scale parameter"
			]
		],
		description: "Compatibility name for GAMMA.INV. Prefer GAMMA.INV in new formulas.",
		examples: ["=GAMMAINV(0.5, 9, 2) is equivalent to =GAMMA.INV(0.5, 9, 2)."]
	},
	gammaln: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"x",
			"number",
			"Positive real number"
		]],
		description: "Returns the natural logarithm of the gamma function. Use it to avoid numeric overflow when computing large factorials or gamma values - working in log-space keeps numbers manageable.",
		examples: ["=GAMMALN(10) returns ln(9!) ≈ 12.802."]
	},
	"gammaln.precise": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"...",
			"number",
			"Positive real number"
		]],
		description: "A higher-precision version of GAMMALN, using a more accurate algorithm. Use it when numerical precision matters in scientific or statistical computations.",
		examples: ["=GAMMALN.PRECISE(10)."]
	},
	gauss: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"z",
			"number",
			"The number of standard deviations from the mean at which to evaluate the probability"
		]],
		description: "Returns the probability that a standard normal variable falls between 0 and z - equal to Φ(z) − 0.5. Use it when you need the one-sided probability from the mean to a specific z-score.",
		examples: ["=GAUSS(1) returns approximately 0.3413."]
	},
	gcd: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number1",
			"integer",
			"First non-negative integer"
		], [
			"...",
			"integer",
			"Additional non-negative integers"
		]],
		description: "Returns the greatest common divisor of two or more integers - the largest number that divides all of them evenly. Use it to simplify fractions or to find the largest common factor shared between quantities.",
		examples: ["=GCD(12, 8) returns 4."]
	},
	geomean: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First positive value or range"
		], [
			"...",
			"number_or_range",
			"Additional positive values or ranges"
		]],
		description: "Returns the geometric mean of a set of positive numbers. Use it to average rates of change or growth rates - for instance, the average annual return of an investment, where the geometric mean correctly accounts for compounding.",
		examples: ["=GEOMEAN(1.05, 1.08, 0.97) returns the average growth factor."]
	},
	gestep: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"number",
			"The value to compare against the step threshold"
		], [
			"step*",
			"number",
			"The cutoff to compare against; defaults to zero when omitted"
		]],
		description: "Returns 1 if a number is greater than or equal to a step value, and 0 otherwise. Use it to implement threshold comparisons in engineering models without writing an IF formula.",
		examples: ["=GESTEP(5, 3) returns 1; =GESTEP(2, 3) returns 0."]
	},
	growth: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"known_ys",
				"number_or_range",
				"Known dependent values"
			],
			[
				"known_xs*",
				"number_or_range",
				"Known independent values; defaults to 1, 2, 3..."
			],
			[
				"new_xs*",
				"number_or_range",
				"New x values for which to predict y"
			],
			[
				"const*",
				"logical",
				"TRUE (default) fits the constant b; FALSE forces b=1"
			]
		],
		description: "Returns predicted y-values along an exponential trend curve fitted to known data. The exponential counterpart to TREND.",
		examples: ["=GROWTH(B2:B6, A2:A6, A7:A10) predicts future values from an exponential curve."]
	},
	harmean: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First positive value or range"
		], [
			"...",
			"number_or_range",
			"Additional positive values or ranges"
		]],
		description: "Returns the harmonic mean of a set of numbers. Use it to average rates - speeds, prices per unit, or yields - where the reciprocal relationship matters more than simple averaging.",
		examples: ["=HARMEAN(A2:A10) returns the harmonic average."]
	},
	hex2bin: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"text",
			"Hexadecimal string to convert (up to 10 characters)"
		], [
			"places*",
			"integer",
			"Minimum width of the result, padded with leading zeros"
		]],
		description: "Converts a hexadecimal number to binary. Use it to inspect the individual bits of a hex value - common in network protocols and hardware analysis.",
		examples: ["=HEX2BIN(\"F\") returns \"1111\"."]
	},
	hex2dec: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"text",
			"Hexadecimal string to convert"
		]],
		description: "Converts a hexadecimal number to decimal. Use it to translate memory addresses, web color codes, or protocol fields into regular numbers.",
		examples: ["=HEX2DEC(\"FF\") returns 255."]
	},
	hex2oct: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"text",
			"Hexadecimal string to convert"
		], [
			"places*",
			"integer",
			"Minimum width of the result, padded with leading zeros"
		]],
		description: "Converts a hexadecimal number to octal. A utility for moving between hex and octal representations when both notations appear in the same system.",
		examples: ["=HEX2OCT(\"F\") returns \"17\"."]
	},
	hlookup: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"lookup_value",
				"any",
				"Value to search for in the first row of the table"
			],
			[
				"table_array",
				"range",
				"Table to search, with the key row at the top"
			],
			[
				"row_index",
				"integer",
				"1-based row number within the table to return a value from"
			],
			[
				"range_lookup",
				"logical",
				"TRUE for approximate match (first row must be sorted); FALSE for exact match"
			]
		],
		description: "Looks up a value in the first row of a table and returns a value from the same column a specified number of rows down. Use it for horizontal lookup tables where categories are in the first row and data sits below them.",
		examples: ["=HLOOKUP(\"Q2\", A1:D5, 3, FALSE) finds \"Q2\" in row 1 and returns the value in row 3 of that column."]
	},
	hour: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"serial_number",
			"date_or_time",
			"Time or date-time value from which to extract the hour (0-23)"
		]],
		description: "Extracts the hour component (0–23) from a time value. Use it to group transactions by time of day or to filter records to a specific hour.",
		examples: ["=HOUR(A2) returns 14 if A2 contains 2:45 PM."]
	},
	hstack: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"array1",
			"array",
			"First array"
		], [
			"...",
			"array",
			"Additional arrays to append to the right"
		]],
		description: "Combines multiple arrays or ranges side by side (horizontally) into a single array. Use it to merge separate datasets that have the same number of rows into one wider table.",
		examples: ["=HSTACK(A1:B10, D1:E10) joins two two-column ranges into a single four-column array."]
	},
	hyperlink: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"link_location",
			"text",
			"Target of the link: an URL (\"https://...\"), an email address (\"mailto:...\") or, with a \"#\" prefix, a location in this workbook (\"#Sheet1!A10\")"
		], [
			"friendly_name*",
			"any",
			"Value displayed in the cell; if omitted, link_location is displayed"
		]],
		description: "Creates a clickable link in the cell and returns the text to display. The target can be a web page, an email address or, prefixed with \"#\", a cell in this workbook. The link lives as long as the formula produces it and cannot be edited from the cell.",
		examples: ["=HYPERLINK(\"https://www.ironcalc.com/\", \"IronCalc\") shows \"IronCalc\" linking to the IronCalc site.", "=HYPERLINK(\"#Sheet2!A10\", \"Jump\") shows \"Jump\" and selects A10 in Sheet2 when clicked."]
	},
	"hypgeom.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"sample_s",
				"integer",
				"Count of successful draws in the sample"
			],
			[
				"number_sample",
				"integer",
				"How many items were drawn"
			],
			[
				"population_s",
				"integer",
				"Total successes available in the whole population"
			],
			[
				"number_pop",
				"integer",
				"Total size of the population"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution function; FALSE for the probability mass function"
			]
		],
		description: "Returns the hypergeometric distribution probability - the probability of exactly k successes when drawing n items without replacement from a population of N containing K successes. Use it for quality sampling when items are not returned after each draw.",
		examples: ["=HYPGEOM.DIST(3, 10, 20, 100, FALSE) returns the exact probability."]
	},
	hypgeomdist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"sample_s",
				"integer",
				"Successes in the sample"
			],
			[
				"number_sample",
				"integer",
				"Sample size"
			],
			[
				"population_s",
				"integer",
				"Successes in the population"
			],
			[
				"number_pop",
				"integer",
				"Population size"
			]
		],
		description: "Compatibility name for HYPGEOM.DIST (non-cumulative form). Prefer HYPGEOM.DIST in new formulas.",
		examples: ["=HYPGEOMDIST(1, 4, 8, 20) is equivalent to =HYPGEOM.DIST(1, 4, 8, 20, FALSE)."]
	},
	if: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"logical_test",
				"logical",
				"Condition to evaluate"
			],
			[
				"value_if_true",
				"any",
				"Value to return when the condition is TRUE"
			],
			[
				"value_if_false*",
				"any",
				"Value to return when the condition is FALSE; returns FALSE if omitted"
			]
		],
		description: "Returns one value when a condition is TRUE and a different value when it is FALSE. The most fundamental branching function in Excel - use it whenever your output depends on whether a condition is met.",
		examples: ["=IF(A2>0, \"Positive\", \"Zero or negative\") labels each row based on its value."]
	},
	iferror: {
		tier: 0,
		category: 6,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to evaluate"
		], [
			"value_if_error",
			"any",
			"Value to return if the expression produces any error"
		]],
		description: "Returns a value you specify if a formula produces any error; otherwise returns the formula's normal result. Use it to replace error codes with a blank, zero, or friendly message - most often around VLOOKUP or division formulas.",
		examples: ["=IFERROR(VLOOKUP(A2, B:C, 2, 0), \"Not found\")."]
	},
	ifna: {
		tier: 0,
		category: 6,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to evaluate"
		], [
			"value_if_na",
			"any",
			"Value to return specifically when the expression returns #N/A"
		]],
		description: "Returns the value you specify only if the formula produces #N/A; all other errors pass through unchanged. Use it when you specifically want to catch \"not found\" from lookups without suppressing other error types.",
		examples: ["=IFNA(VLOOKUP(A2, B:C, 2, 0), \"Not found\") catches only #N/A."]
	},
	ifs: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"test1",
				"logical",
				"First condition to test"
			],
			[
				"value1*",
				"any",
				"Value to return when test1 is TRUE"
			],
			[
				"...",
				"any",
				"Additional test/value pairs evaluated in order"
			]
		],
		description: "Tests multiple conditions in order and returns the value associated with the first TRUE one. Use it as a cleaner replacement for nested IF formulas when you have three or more distinct branches.",
		examples: ["=IFS(A2>=90, \"A\", A2>=80, \"B\", A2>=70, \"C\", TRUE, \"F\") assigns a letter grade."]
	},
	imabs: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber",
			"complex",
			"Complex number as a text string, e.g. \"3+4i\""
		]],
		description: "Returns the modulus (absolute value) of a complex number - its distance from the origin in the complex plane. Use it to find the magnitude of a complex quantity such as an impedance or a phasor.",
		examples: ["=IMABS(\"3+4i\") returns 5."]
	},
	imaginary: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber",
			"complex",
			"Complex number as a text string; returns the imaginary coefficient"
		]],
		description: "Extracts the imaginary part from a complex number string. Use it when you need just the \"b\" coefficient from \"a+bi\" for further calculations.",
		examples: ["=IMAGINARY(\"3+4i\") returns 4."]
	},
	imargument: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber",
			"complex",
			"Complex number as a text string; returns the angle in radians"
		]],
		description: "Returns the angle (argument) of a complex number in radians - the angle it makes with the positive real axis. Use it in signal processing to find the phase of a complex quantity.",
		examples: ["=IMARGUMENT(\"1+1i\") returns π/4 ≈ 0.785."]
	},
	imconjugate: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the complex conjugate of a complex number - same real part, negated imaginary part. Use it in complex division or AC circuit analysis to simplify expressions.",
		examples: ["=IMCONJUGATE(\"3+4i\") returns \"3-4i\"."]
	},
	imcos: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the cosine of a complex number. Used in advanced mathematical and engineering analysis where trigonometric functions take complex arguments.",
		examples: ["=IMCOS(\"1+1i\") returns a complex result."]
	},
	imcosh: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the hyperbolic cosine of a complex number. Appears in advanced mathematics and physics involving complex arguments to hyperbolic functions.",
		examples: ["=IMCOSH(\"1+1i\")."]
	},
	imcot: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the cotangent of a complex number. A specialized function for advanced mathematical derivations.",
		examples: ["=IMCOT(\"1+1i\")."]
	},
	imcsc: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the cosecant (1/sin) of a complex number. Used in specialized mathematical computations.",
		examples: ["=IMCSC(\"1+1i\")."]
	},
	imcsch: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the hyperbolic cosecant of a complex number. Appears in advanced physics and mathematics.",
		examples: ["=IMCSCH(\"1+1i\")."]
	},
	imdiv: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num1",
			"complex",
			"Dividend (complex number as text)"
		], [
			"complex_num2",
			"complex",
			"Divisor (complex number as text)"
		]],
		description: "Divides one complex number by another and returns the result as a complex number. Use it for complex arithmetic in circuit analysis or signal processing.",
		examples: ["=IMDIV(\"3+4i\", \"1+2i\") returns the complex quotient."]
	},
	imexp: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns e raised to the power of a complex number. Essential in signal analysis and Fourier-related calculations where complex exponentials appear.",
		examples: ["=IMEXP(\"1+1i\") returns e^(1+i)."]
	},
	imln: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the natural logarithm of a complex number. Use it in engineering and physics where the log of a complex quantity is needed.",
		examples: ["=IMLN(\"3+4i\") returns the complex natural logarithm."]
	},
	imlog10: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the base-10 logarithm of a complex number. Use it in decibel calculations or other logarithmic engineering measures with complex inputs.",
		examples: ["=IMLOG10(\"3+4i\")."]
	},
	imlog2: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the base-2 logarithm of a complex number. Useful in information theory and digital signal processing with complex inputs.",
		examples: ["=IMLOG2(\"3+4i\")."]
	},
	impower: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber",
			"complex",
			"Base complex number as a text string"
		], [
			"number",
			"number",
			"Exponent to raise the complex number to"
		]],
		description: "Raises a complex number to a given power and returns the result as a complex number. Use it in physics, control theory, or mathematical analysis.",
		examples: ["=IMPOWER(\"1+1i\", 3) returns (1+i)³."]
	},
	improduct: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber1",
			"complex",
			"First complex number as a text string"
		], [
			"inumber2",
			"complex",
			"Additional complex numbers to multiply; at least one more required"
		]],
		description: "Multiplies two or more complex numbers together. Use it to chain complex multiplications in AC circuit or signal-processing calculations.",
		examples: ["=IMPRODUCT(\"1+2i\", \"3+4i\") returns the complex product."]
	},
	imreal: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber",
			"complex",
			"Complex number as a text string; returns the real coefficient"
		]],
		description: "Extracts the real part from a complex number string. Use it when you need just the \"a\" coefficient from \"a+bi\" for further arithmetic.",
		examples: ["=IMREAL(\"3+4i\") returns 3."]
	},
	imsec: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the secant (1/cos) of a complex number. A specialized function for advanced mathematical use cases.",
		examples: ["=IMSEC(\"1+1i\")."]
	},
	imsech: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the hyperbolic secant of a complex number. Appears in advanced mathematical and physical derivations.",
		examples: ["=IMSECH(\"1+1i\")."]
	},
	imsin: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the sine of a complex number. Used in Fourier analysis, quantum mechanics, and other fields involving complex arguments to sine.",
		examples: ["=IMSIN(\"1+1i\")."]
	},
	imsinh: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the hyperbolic sine of a complex number. Used in advanced physics and mathematics involving hyperbolic functions of complex arguments.",
		examples: ["=IMSINH(\"1+1i\")."]
	},
	imsqrt: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the principal square root of a complex number. Use it to take the square root of a negative or complex quantity without getting an error.",
		examples: ["=IMSQRT(\"-1+0i\") returns \"0+1i\" (the imaginary unit)."]
	},
	imsub: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber1",
			"complex",
			"Minuend (complex number as text)"
		], [
			"inumber2",
			"complex",
			"Subtrahend (complex number as text)"
		]],
		description: "Subtracts one complex number from another and returns the result as a complex number. Use it for complex arithmetic - for instance, finding the difference between two phasors.",
		examples: ["=IMSUB(\"5+3i\", \"2+1i\") returns \"3+2i\"."]
	},
	imsum: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"inumber1",
			"complex",
			"First complex number as a text string"
		], [
			"inumber2",
			"complex",
			"Additional complex numbers to add; at least one more required"
		]],
		description: "Adds two or more complex numbers together. Use it to sum phasors or complex vectors in electrical or mechanical engineering analysis.",
		examples: ["=IMSUM(\"1+2i\", \"3+4i\") returns \"4+6i\"."]
	},
	imtan: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"complex_num",
			"complex",
			"Complex number as a text string"
		]],
		description: "Returns the tangent of a complex number. A specialized function for advanced mathematical computations.",
		examples: ["=IMTAN(\"1+1i\")."]
	},
	index: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Array or range to retrieve from"
			],
			[
				"row_num",
				"integer",
				"1-based row to return; 0 returns the entire column"
			],
			[
				"col_num",
				"integer",
				"1-based column to return; 0 returns the entire row"
			],
			[
				"area_num*",
				"integer",
				"Which area to use when the reference contains multiple separate areas"
			]
		],
		description: "Returns the value at a specified row and column within a range. Most often combined with MATCH to create a flexible two-way lookup that works from left to right - unlike VLOOKUP.",
		examples: ["=INDEX(B2:D10, MATCH(\"Alice\", A2:A10, 0), 2) returns Alice's value from the second column of the data."]
	},
	indirect: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"ref_text",
			"text",
			"Cell address or range as a text string, e.g. \"B2\" or \"Sheet1!A1\""
		], [
			"...",
			"logical",
			"TRUE or omitted for A1-style addresses; FALSE for R1C1-style"
		]],
		description: "Returns a cell or range reference built from a text string, evaluated at runtime. Use it to create dynamic references - for instance, referencing a sheet name stored in a cell, or building a range address from row and column variables.",
		examples: ["=INDIRECT(\"Sheet2!A1\") returns whatever is in Sheet2's A1."]
	},
	info: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"type_text",
			"text",
			"Category of environment information to return, e.g. \"version\", \"osversion\", \"numfile\""
		]],
		description: "Returns information about the current operating environment - such as the Excel version, operating system, or number of sheets. Use it for diagnostics or to make formulas behave differently across environments.",
		examples: ["=INFO(\"version\") returns the Excel version string."]
	},
	int: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round down to the nearest integer (toward negative infinity)"
		]],
		description: "Rounds a number down to the nearest integer, toward negative infinity. Use it to truncate a decimal to a whole number - but note that for negative numbers, =INT(-4.2) returns -5, not -4; use TRUNC if you always want rounding toward zero.",
		examples: ["=INT(4.9) returns 4."]
	},
	intercept: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"known_ys",
			"number_or_range",
			"Dependent (y) data points"
		], [
			"known_xs",
			"number_or_range",
			"Independent (x) data points, same count as known_ys"
		]],
		description: "Returns the y-intercept of the linear regression line through a set of data points. Use it with SLOPE to build a simple linear model: predicted_y = SLOPE × x + INTERCEPT.",
		examples: ["=INTERCEPT(B2:B20, A2:A20) returns the constant term of the best-fit line."]
	},
	intrate: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"investment",
				"number",
				"Amount invested"
			],
			[
				"redemption",
				"number",
				"Amount received at maturity"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the effective annual interest rate for a fully invested security — one that pays no periodic coupons but instead returns a lump sum at maturity.",
		examples: ["=INTRATE(A2, B2, 1000, 1100, 0) returns the annual rate on a zero-coupon security."]
	},
	ipmt: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"per",
				"integer",
				"Period number to calculate the interest portion for (1-based)"
			],
			[
				"nper",
				"integer",
				"Total number of payment periods"
			],
			[
				"pv",
				"number",
				"Present value of the loan"
			],
			[
				"fv*",
				"number",
				"Future value after the last payment; defaults to 0"
			],
			[
				"type*",
				"integer",
				"0 for end-of-period payments; 1 for beginning-of-period"
			]
		],
		description: "Returns the interest portion of a specific loan payment. Use it to see exactly how much of a given month's payment goes toward interest versus principal.",
		examples: ["=IPMT(rate, period, nper, pv) returns the interest amount for that one period."]
	},
	irr: {
		tier: 0,
		category: 4,
		tags: [],
		args: [[
			"values",
			"range",
			"Cash flow amounts; negative values are outflows, positive are inflows"
		], [
			"...",
			"number",
			"Initial guess for the rate; defaults to 0.1"
		]],
		description: "Calculates the Internal Rate of Return for a series of cash flows. Use it to evaluate whether an investment project is worthwhile - the IRR is the discount rate that makes the NPV equal to zero, and you compare it against your required return.",
		examples: ["=IRR(A2:A10) returns the annualized rate of return for the cash-flow series."]
	},
	isblank: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression or cell reference to test for emptiness"
		]],
		description: "Returns TRUE if a cell is completely empty, FALSE otherwise. Use it to check for missing data before performing calculations, or to drive conditional formatting on empty cells.",
		examples: ["=ISBLANK(A2) returns TRUE only if A2 has no content at all."]
	},
	iserr: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to test; returns TRUE for any error except #N/A"
		]],
		description: "Returns TRUE if a cell contains any error except #N/A. Use it when you want to catch all errors except #N/A separately - distinguishing \"not found\" from other problems.",
		examples: ["=ISERR(A2) returns TRUE for #DIV/0!, #VALUE!, and #REF!, but not for #N/A."]
	},
	iserror: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to test; returns TRUE for any error value"
		]],
		description: "Returns TRUE if a cell contains any error value, including #N/A. Use it as a general error trap to display a friendly message instead of an error code.",
		examples: ["=IF(ISERROR(VLOOKUP(...)), \"Not found\", VLOOKUP(...))."]
	},
	iseven: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"number",
			"Number to test for being even"
		]],
		description: "Returns TRUE if a number is even, FALSE if odd. Use it to alternate row styles in a table (combined with ROW()), to flag even quantities, or as a simple parity check.",
		examples: ["=ISEVEN(4) returns TRUE; =ISEVEN(3) returns FALSE."]
	},
	isformula: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"reference",
			"reference",
			"Cell to check for containing a formula"
		]],
		description: "Returns TRUE if a cell contains a formula, FALSE if it contains a plain value. Use it to audit spreadsheets and identify which cells are computed versus hard-coded.",
		examples: ["=ISFORMULA(A2) returns TRUE if A2 has a formula."]
	},
	islogical: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to test for being a logical value (TRUE or FALSE)"
		]],
		description: "Returns TRUE if a cell contains a logical value (TRUE or FALSE). Use it to validate inputs or to distinguish logical values from numbers and text in mixed-type data.",
		examples: ["=ISLOGICAL(TRUE) returns TRUE; =ISLOGICAL(1) returns FALSE."]
	},
	isna: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to test for the #N/A error specifically"
		]],
		description: "Returns TRUE if a cell contains the #N/A error. Use it specifically to detect \"not found\" results from lookup functions without trapping other error types.",
		examples: ["=IF(ISNA(VLOOKUP(...)), \"Not found\", VLOOKUP(...))."]
	},
	isnontext: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to test; returns TRUE for anything that is not a text string"
		]],
		description: "Returns TRUE if a cell does not contain text - including numbers, logical values, dates, errors, and blanks. Use it to validate that a field contains a non-text value.",
		examples: ["=ISNONTEXT(42) returns TRUE; =ISNONTEXT(\"hello\") returns FALSE."]
	},
	isnumber: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to test for being a numeric value"
		]],
		description: "Returns TRUE if a cell contains a number. Use it to validate numeric inputs or to filter mixed-type arrays where only numbers should be processed.",
		examples: ["=ISNUMBER(A2) returns TRUE if A2 holds a numeric value."]
	},
	"iso.ceiling": {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"The value you want to round up"
		], [
			"significance*",
			"number",
			"The multiple to round up to; defaults to 1 when omitted"
		]],
		description: "Rounds a number up toward positive infinity to the nearest multiple of significance. Equivalent to CEILING.PRECISE - provided for ISO standard compatibility.",
		examples: ["=ISO.CEILING(4.3, 0.5) returns 4.5."]
	},
	isodd: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"number",
			"Number to test for being odd"
		]],
		description: "Returns TRUE if a number is odd, FALSE if even. Use it alongside ISEVEN for alternating logic - for instance, treating odd-numbered periods differently from even ones.",
		examples: ["=ISODD(3) returns TRUE; =ISODD(4) returns FALSE."]
	},
	isomitted: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"argument",
			"any",
			"A LAMBDA parameter to test for having been omitted by the caller"
		]],
		description: "Returns TRUE if an argument passed to a LAMBDA is missing (omitted by the caller). Use it inside LAMBDA definitions to detect optional arguments and supply default values.",
		examples: ["inside a LAMBDA, =IF(ISOMITTED(x), 0, x) defaults x to 0 when not provided."]
	},
	isoweeknum: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"date",
			"date",
			"Date whose ISO week number (1-53, Monday-based) you want"
		]],
		description: "Returns the ISO week number (1–53) of a given date, following the international standard where weeks start on Monday and week 1 contains the year's first Thursday. Use it for scheduling in industries that track work by ISO week numbers.",
		examples: ["=ISOWEEKNUM(DATE(2025,1,1)) returns 1."]
	},
	ispmt: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"per",
				"integer",
				"Period number to calculate interest for (0-based)"
			],
			[
				"nper",
				"integer",
				"Total number of payment periods"
			],
			[
				"pv",
				"number",
				"Present value of the investment"
			]
		],
		description: "Returns the interest paid during a specific period of a loan assuming simple interest (equal principal payments each period). It differs from IPMT in its loan structure assumption. Use it for loans structured on a simple-interest basis.",
		examples: ["=ISPMT(rate, period, nper, pv)."]
	},
	isref: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to test for being a cell or range reference"
		]],
		description: "Returns TRUE if a value is a valid cell reference. Use it to check whether an INDIRECT formula produced a valid reference before using it.",
		examples: ["=ISREF(INDIRECT(A2)) returns TRUE if A2 holds a valid cell address."]
	},
	istext: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to test for being a text string"
		]],
		description: "Returns TRUE if a cell contains text. Use it to validate text inputs, filter text values in arrays, or guard against text accidentally entering a numeric calculation.",
		examples: ["=ISTEXT(\"hello\") returns TRUE; =ISTEXT(42) returns FALSE."]
	},
	kurt: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the kurtosis of a dataset - a measure of how heavy the tails are compared to a normal distribution. Positive kurtosis means more extreme outliers than normal; negative means fewer. Use it to understand whether your data has unusual outlier behavior.",
		examples: ["=KURT(A2:A100) returns the excess kurtosis."]
	},
	lambda: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"parameter*",
				"any",
				"A name for a value passed to the function, e.g. x. Optional; add one per parameter (up to 253)."
			],
			[
				"...",
				"any",
				"Additional parameter names."
			],
			[
				"calculation",
				"any",
				"The formula to evaluate using the parameters. Always the last argument."
			]
		],
		description: "Defines a custom, reusable function with named parameters that you can store in the Name Manager and call like any built-in function. Use it to package a complex formula you repeat often into a named function, making your workbook easier to maintain and understand.",
		examples: ["=LAMBDA(x, x^2)(5) returns 25 inline; stored as SQUARE, you can use =SQUARE(5) anywhere."]
	},
	large: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array",
			"number_or_range",
			"Values to search"
		], [
			"k",
			"integer",
			"Rank from the top (1 returns the maximum)"
		]],
		description: "Returns the k-th largest value in a dataset. Use it to find top-N values - the second-highest score, third-largest sale - without sorting the data.",
		examples: ["=LARGE(A2:A100, 3) returns the third-largest value."]
	},
	lcm: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number1",
			"integer",
			"First positive integer"
		], [
			"...",
			"integer",
			"Additional positive integers"
		]],
		description: "Returns the least common multiple of two or more integers - the smallest number that is a multiple of all the supplied values. Use it to synchronize repeating events or to find a common denominator.",
		examples: ["=LCM(4, 6) returns 12."]
	},
	left: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"Source string"
		], [
			"num_chars",
			"integer",
			"Number of characters to extract from the start"
		]],
		description: "Returns the specified number of characters from the start of a text string. Use it to extract a prefix - for instance, the first three characters of a product code.",
		examples: ["=LEFT(A2, 3) returns the first 3 characters of A2."]
	},
	leftb: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"Source string"
		], [
			"num_chars*",
			"integer",
			"How many characters to take from the start; defaults to 1 when omitted"
		]],
		description: "Returns the first characters of a text string. Equivalent to LEFT; provided for compatibility with double-byte (East Asian) locales.",
		examples: ["=LEFTB(A2, 4) returns the leftmost 4 characters."]
	},
	len: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String whose character count you want"
		]],
		description: "Returns the number of characters in a text string. Use it to check entry lengths - validating that a field isn't too long, detecting trailing spaces, or building dynamic formulas that depend on string length.",
		examples: ["=LEN(A2) returns the character count."]
	},
	lenb: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String whose character count you want"
		]],
		description: "Returns the number of characters in a text string. Equivalent to LEN; provided for compatibility with double-byte (East Asian) locales.",
		examples: ["=LENB(A2) returns the character count."]
	},
	let: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"name1",
				"text",
				"Name of the first variable"
			],
			[
				"value1",
				"any",
				"Value or expression to assign to name1"
			],
			[
				"name2/value2",
				"any",
				"Additional name/value pairs (always in pairs)"
			],
			[
				"...",
				"any",
				"The final argument is the formula that uses the defined names"
			]
		],
		description: "Assigns names to intermediate calculation results within a formula, letting you reuse them without repeating the expression. Use it to make complex formulas more readable and to avoid calculating the same subexpression multiple times.",
		examples: ["=LET(rate, 0.2, gross, A2*1.15, gross*(1-rate)) computes the net amount."]
	},
	linest: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"known_ys",
				"number_or_range",
				"Dependent data series"
			],
			[
				"known_xs*",
				"number_or_range",
				"Independent data series; defaults to 1, 2, 3..."
			],
			[
				"const*",
				"logical",
				"TRUE includes the intercept; FALSE forces it to zero"
			],
			[
				"stats*",
				"logical",
				"TRUE returns additional regression statistics; FALSE returns just the coefficients"
			]
		],
		description: "Returns the parameters of a linear regression as an array. Enter as an array formula. When stats is TRUE, five rows of statistics including R² and standard errors are returned.",
		examples: ["=LINEST(C2:C10, A2:B10, TRUE, TRUE) returns full regression statistics for two predictors."]
	},
	ln: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Positive real number whose natural logarithm you want"
		]],
		description: "Returns the natural logarithm of a number (logarithm base e). Use it for exponential growth/decay analysis, probability distributions, and any formula where the natural log is required.",
		examples: ["=LN(EXP(1)) returns 1; =LN(100) ≈ 4.605."]
	},
	log: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Positive real number"
		], [
			"...",
			"number",
			"Logarithm base; defaults to 10"
		]],
		description: "Returns the logarithm of a number to a specified base (default is 10). Use it when working in a particular base - base-2 for information theory, base-10 for decibels, or a custom base for specialized formulas.",
		examples: ["=LOG(1000, 10) returns 3; =LOG(8, 2) returns 3."]
	},
	log10: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Positive real number whose base-10 logarithm you want"
		]],
		description: "Returns the base-10 logarithm of a number. Use it for decibel calculations, pH calculations, and any formula where common (base-10) logarithms are the standard.",
		examples: ["=LOG10(1000) returns 3."]
	},
	logest: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"known_ys",
				"number_or_range",
				"Dependent data series (must be positive)"
			],
			[
				"known_xs*",
				"number_or_range",
				"Independent data series; defaults to 1, 2, 3..."
			],
			[
				"const*",
				"logical",
				"TRUE includes the base constant; FALSE forces it to 1"
			],
			[
				"stats*",
				"logical",
				"TRUE returns additional regression statistics"
			]
		],
		description: "Fits an exponential curve to data and returns the parameters as an array. The exponential equivalent of LINEST.",
		examples: ["=LOGEST(B2:B10, A2:A10, TRUE, FALSE) returns the base and multiplier of the best-fit exponential curve."]
	},
	loginv: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Probability between 0 and 1 exclusive"
			],
			[
				"mean",
				"number",
				"Mean of the underlying normal distribution (ln x)"
			],
			[
				"standard_dev",
				"number",
				"Standard deviation of the underlying normal distribution"
			]
		],
		description: "Compatibility name for LOGNORM.INV. Prefer LOGNORM.INV in new formulas.",
		examples: ["=LOGINV(0.5, 3, 1) is equivalent to =LOGNORM.INV(0.5, 3, 1)."]
	},
	"lognorm.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Point at which to evaluate the distribution; must be positive"
			],
			[
				"mean",
				"number",
				"Mean of the variable's natural logarithm"
			],
			[
				"standard_dev",
				"number",
				"Standard deviation of the variable's natural logarithm"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution function; FALSE for the probability density function"
			]
		],
		description: "Returns the log-normal distribution probability (CDF or PDF). Use it to model data that is the product of many positive factors - stock prices, income distributions, particle sizes.",
		examples: ["=LOGNORM.DIST(4, 1, 0.5, TRUE) returns the cumulative probability."]
	},
	"lognorm.inv": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Cumulative probability between 0 and 1 for the log-normal distribution"
			],
			[
				"mean",
				"number",
				"Mean of the variable's natural logarithm"
			],
			[
				"standard_dev",
				"number",
				"Standard deviation of the variable's natural logarithm"
			]
		],
		description: "Returns the inverse of the log-normal cumulative distribution - the value at a given percentile. Use it to find percentile values for a log-normally distributed variable.",
		examples: ["=LOGNORM.INV(0.9, 1, 0.5) returns the 90th percentile."]
	},
	lognormdist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value to evaluate (must be positive)"
			],
			[
				"mean",
				"number",
				"Mean of the underlying normal distribution (ln x)"
			],
			[
				"standard_dev",
				"number",
				"Standard deviation of the underlying normal distribution"
			]
		],
		description: "Compatibility name for LOGNORM.DIST (cumulative form). Prefer LOGNORM.DIST in new formulas.",
		examples: ["=LOGNORMDIST(4, 3, 1) is equivalent to =LOGNORM.DIST(4, 3, 1, TRUE)."]
	},
	lookup: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"lookup_value",
				"any",
				"Value to search for"
			],
			[
				"lookup_vector*",
				"range",
				"Sorted single-row or single-column range to search in"
			],
			[
				"...",
				"range",
				"Range to return a value from; defaults to lookup_vector"
			]
		],
		description: "Searches a one-row or one-column range for a value and returns a corresponding value from another range. An older function largely superseded by VLOOKUP and XLOOKUP, but still useful for approximate-match lookups in sorted data.",
		examples: ["=LOOKUP(B2, rate_column, bracket_column) returns the bracket corresponding to B2."]
	},
	lower: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String to convert to lowercase"
		]],
		description: "Converts all letters in a text string to lowercase. Use it to normalize text before comparing or storing it - for instance, ensuring all email addresses are consistently lowercase.",
		examples: ["=LOWER(\"HELLO WORLD\") returns \"hello world\"."]
	},
	makearray: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"rows",
				"integer",
				"Number of rows in the output array"
			],
			[
				"cols",
				"integer",
				"Number of columns in the output array"
			],
			[
				"lambda",
				"function",
				"LAMBDA(row, col) called for each cell to produce its value"
			]
		],
		description: "Creates an array of a specified size by calling a LAMBDA with the 1-based row and column index for each cell.",
		examples: ["=MAKEARRAY(3, 4, LAMBDA(r, c, r*c)) builds a 3×4 multiplication table."]
	},
	map: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"array1",
				"array",
				"First array to pass element-wise to the LAMBDA"
			],
			[
				"array2",
				"array",
				"Second array (additional arrays may follow before the LAMBDA)"
			],
			[
				"...",
				"function",
				"LAMBDA that receives one element from each array and returns a value; must be the last argument"
			]
		],
		description: "Applies a LAMBDA function to each element of one or more arrays and returns an array of results. Use it to transform every value in a list with a custom calculation - a type-safe alternative to array formulas.",
		examples: ["=MAP(A2:A10, LAMBDA(x, x^2)) returns the squares of each value."]
	},
	match: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"lookup_value",
				"any",
				"Value to find"
			],
			[
				"lookup_array",
				"range",
				"Single-row or single-column range to search"
			],
			[
				"match_type",
				"integer",
				"-1 finds the smallest value >= lookup_value (descending order required); 0 finds the first exact match; 1 finds the largest value <= lookup_value (ascending order required)"
			]
		],
		description: "Searches for a value in a range and returns its relative position. Most often paired with INDEX for flexible lookups; also useful on its own to find where an item sits in a list.",
		examples: ["=MATCH(\"Alice\", A2:A100, 0) returns the row number of \"Alice\" in the range."]
	},
	max: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the largest value in a set of numbers. Use it to find the peak figure in a list - highest sales amount, latest date, or fastest time.",
		examples: ["=MAX(A2:A100) returns the largest value in the range."]
	},
	maxa: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"value1",
			"any",
			"First value or range; text counts as 0, TRUE as 1, FALSE as 0"
		], [
			"...",
			"any",
			"Additional values or ranges"
		]],
		description: "Returns the largest value in a range, treating text as 0 and TRUE as 1. Use it when you want the maximum across a mixed-type range and need non-numeric values to be counted rather than skipped.",
		examples: ["=MAXA(A2:A20) returns the maximum even if the range contains text."]
	},
	maxifs: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"max_range",
				"range",
				"Cells to find the maximum in"
			],
			[
				"range1*",
				"range",
				"First criteria range"
			],
			[
				"criteria1*",
				"any",
				"Condition for range1"
			],
			[
				"range2*",
				"range",
				"Additional criteria range"
			],
			[
				"...",
				"any",
				"Additional criteria for the extra ranges"
			]
		],
		description: "Returns the maximum value among cells that meet one or more conditions. Use it to find the highest value within a filtered group - for instance, the largest sale in the West region.",
		examples: ["=MAXIFS(C2:C100, B2:B100, \"West\") returns the largest value in C where B is \"West\"."]
	},
	mdeterm: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"array",
			"array",
			"Square numeric matrix (same number of rows and columns)"
		]],
		description: "Returns the determinant of a square matrix. Use it in linear algebra - for instance, to check whether a system of equations has a unique solution (a non-zero determinant) or to apply Cramer's rule.",
		examples: ["=MDETERM(A1:D4) returns the determinant of the 4×4 matrix."]
	},
	mduration: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"coupon",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"yld",
				"number",
				"Annual yield as a decimal"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the modified Macaulay duration of a bond with an assumed par value of $100. It rescales DURATION by the yield per period, giving the approximate percentage change in price for a one-point change in yield.",
		examples: ["=MDURATION(A2, B2, 0.05, 0.04, 2, 0) returns the modified duration of a semiannual bond."]
	},
	median: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the middle value of a sorted dataset - half the values are above it and half below. Use it as a more outlier-resistant measure of center than the average.",
		examples: ["=MEDIAN(A2:A100) returns the midpoint value."]
	},
	mid: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"Source string"
			],
			[
				"start_num",
				"integer",
				"1-based position of the first character to extract"
			],
			[
				"num_chars",
				"integer",
				"Number of characters to extract"
			]
		],
		description: "Returns a specified number of characters from a text string, starting at a given position. Use it to extract a substring from the middle of text - pulling the area code from a phone number or a segment from a fixed-format code.",
		examples: ["=MID(A2, 5, 3) returns 3 characters starting at position 5."]
	},
	midb: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"Source string"
			],
			[
				"start_num",
				"integer",
				"1-based character position where the extraction begins"
			],
			[
				"num_chars",
				"integer",
				"How many characters to pull from that position"
			]
		],
		description: "Returns a run of characters from the middle of a text string. Equivalent to MID; provided for compatibility with double-byte (East Asian) locales.",
		examples: ["=MIDB(A2, 3, 4) returns 4 characters starting at position 3."]
	},
	min: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the smallest value in a set of numbers. Use it to find the minimum - lowest score, earliest date, smallest quantity - in a list or range.",
		examples: ["=MIN(A2:A100) returns the smallest value."]
	},
	mina: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"value1",
			"any",
			"First value or range; text counts as 0, TRUE as 1, FALSE as 0"
		], [
			"...",
			"any",
			"Additional values or ranges"
		]],
		description: "Returns the smallest value in a range, treating text as 0 and FALSE as 0. The counterpart of MAXA - use it when non-numeric entries should be considered in the minimum calculation.",
		examples: ["=MINA(A2:A20) returns the minimum including any text (as 0) or FALSE values."]
	},
	minifs: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"min_range",
				"range",
				"Cells to find the minimum in"
			],
			[
				"range1*",
				"range",
				"First criteria range"
			],
			[
				"criteria1*",
				"any",
				"Condition for range1"
			],
			[
				"range2*",
				"range",
				"Additional criteria range"
			],
			[
				"...",
				"any",
				"Additional criteria for the extra ranges"
			]
		],
		description: "Returns the minimum value among cells that meet one or more conditions. Use it to find the lowest value within a filtered subset - the smallest order, earliest date within a category.",
		examples: ["=MINIFS(C2:C100, B2:B100, \"West\") returns the smallest value in C where B is \"West\"."]
	},
	minute: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"serial_number",
			"date_or_time",
			"Time or date-time value from which to extract the minute (0-59)"
		]],
		description: "Extracts the minute component (0–59) from a time value. Use it whenever you need the minute portion of a timestamp - for instance, to check whether a meeting started on time.",
		examples: ["=MINUTE(A2) returns 30 if A2 contains 9:30 AM."]
	},
	minverse: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"array",
			"array",
			"Square invertible numeric matrix"
		]],
		description: "Returns the inverse of a square matrix. Use it in linear algebra to solve systems of equations, since multiplying a matrix by its inverse yields the identity matrix. Enter as an array formula over a range the same size as the input.",
		examples: ["=MINVERSE(A1:B2) returns the 2×2 inverse."]
	},
	mirr: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"values",
				"range",
				"Cash flow amounts; negative values are outflows, positive are inflows"
			],
			[
				"finance_rate",
				"number",
				"Cost of capital applied to the cash outflows"
			],
			[
				"reinvest_rate",
				"number",
				"Rate of return assumed for reinvested positive cash flows"
			]
		],
		description: "Returns the Modified Internal Rate of Return, which accounts for different financing and reinvestment rates. Use it when the standard IRR assumption - that cash flows are reinvested at the IRR - is unrealistic.",
		examples: ["=MIRR(values, finance_rate, reinvest_rate)."]
	},
	mmult: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"array1",
			"array",
			"First matrix, with m rows and n columns"
		], [
			"array2",
			"array",
			"Second matrix, with n rows and p columns"
		]],
		description: "Multiplies two matrices and returns the result matrix. Use it for matrix arithmetic in linear algebra, portfolio analysis, or any application requiring matrix multiplication. Enter as an array formula over a range sized rows(array1) × cols(array2).",
		examples: ["=MMULT(A1:B2, D1:E2) multiplies the two 2×2 matrices."]
	},
	mod: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Dividend"
		], [
			"divisor",
			"number",
			"Divisor; the result carries the same sign as the divisor"
		]],
		description: "Returns the remainder after dividing one number by another. Use it to detect multiples (MOD(n, 3)=0 means n is divisible by 3), alternate row patterns (odd/even), or wrap a numeric sequence.",
		examples: ["=MOD(10, 3) returns 1."]
	},
	mode: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Compatibility name for MODE.SNGL. Prefer MODE.SNGL in new formulas.",
		examples: ["=MODE(A2:A20) is equivalent to =MODE.SNGL(A2:A20)."]
	},
	"mode.mult": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns all values that appear most frequently in a dataset as a vertical array. Use instead of MODE.SNGL when there may be multiple modes.",
		examples: ["=MODE.MULT(A2:A20) returns an array of all tied-most-frequent values."]
	},
	"mode.sngl": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the single most frequently occurring value in a dataset. If there are multiple modes, returns the smallest.",
		examples: ["=MODE.SNGL(A2:A20) returns the value that appears most often."]
	},
	month: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"date",
			"date",
			"Date value from which to extract the month number (1-12)"
		]],
		description: "Extracts the month number (1–12) from a date. Use it to group data by month, build pivot helper columns, or test whether a date falls in a particular month.",
		examples: ["=MONTH(A2) returns 3 for any date in March."]
	},
	mround: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round"
		], [
			"significance",
			"number",
			"Multiple to round to; must have the same sign as number"
		]],
		description: "Rounds a number to the nearest multiple of a specified value. Use it to round prices to the nearest nickel, booking times to the nearest 15 minutes, or quantities to the nearest dozen.",
		examples: ["=MROUND(37, 5) returns 35; =MROUND(38, 5) returns 40."]
	},
	multinomial: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number1",
			"integer",
			"First non-negative integer"
		], [
			"...",
			"integer",
			"Additional non-negative integers"
		]],
		description: "Returns the multinomial coefficient - the number of ways to partition a set into ordered groups of given sizes. Used in combinatorics and probability theory for counting problems with multiple groups.",
		examples: ["=MULTINOMIAL(2, 3, 4) returns 9!/(2!×3!×4!) = 1260."]
	},
	munit: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"dimension",
			"integer",
			"Size of the square identity matrix to generate (n × n)"
		]],
		description: "Returns the unit (identity) matrix of a given dimension - a square matrix with 1s on the diagonal and 0s elsewhere. Use it as a starting point for matrix operations or to build identity-based transformations.",
		examples: ["=MUNIT(3) returns a 3×3 identity matrix."]
	},
	n: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"...",
			"any",
			"Value to convert: numbers pass through, TRUE becomes 1, dates become their serial number, everything else becomes 0"
		]],
		description: "Converts a value to a number: TRUE becomes 1, FALSE becomes 0, text becomes 0, and a number is unchanged. Use it to coerce logical or text values into numbers when a formula requires numeric input.",
		examples: ["=N(TRUE) returns 1; =N(\"hello\") returns 0."]
	},
	na: {
		tier: 0,
		category: 5,
		tags: [],
		args: [],
		description: "Returns the #N/A error value deliberately. Use it to mark missing or unavailable data in a range so that charts skip the gap and lookups handle it explicitly rather than treating it as zero.",
		examples: ["=IF(A2=\"\", NA(), A2) inserts #N/A wherever A2 is blank."]
	},
	"negbinom.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"number_f",
				"integer",
				"How many failures occur before the successes are reached"
			],
			[
				"number_s",
				"integer",
				"The target number of successes to stop at"
			],
			[
				"probability_s",
				"number",
				"Chance of success on each individual trial"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution function; FALSE for the probability mass function"
			]
		],
		description: "Returns the negative binomial distribution probability - the probability of exactly k failures before achieving the r-th success. Use it in reliability testing and sequential sampling scenarios.",
		examples: ["=NEGBINOM.DIST(5, 3, 0.5, FALSE) returns the probability of 5 failures before the 3rd success."]
	},
	negbinomdist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"number_f",
				"integer",
				"Number of failures"
			],
			[
				"number_s",
				"integer",
				"Threshold number of successes"
			],
			[
				"probability_s",
				"number",
				"Probability of success on each trial"
			]
		],
		description: "Compatibility name for NEGBINOM.DIST (non-cumulative form). Prefer NEGBINOM.DIST in new formulas.",
		examples: ["=NEGBINOMDIST(10, 5, 0.25) is equivalent to =NEGBINOM.DIST(10, 5, 0.25, FALSE)."]
	},
	networkdays: {
		tier: 0,
		category: 2,
		tags: [],
		args: [
			[
				"start_date",
				"date",
				"First day of the period"
			],
			[
				"end_date",
				"date",
				"Last day of the period"
			],
			[
				"holidays*",
				"range",
				"Optional list of dates to exclude as non-working days"
			]
		],
		description: "Counts the number of working days (Monday–Friday) between two dates, optionally excluding a list of holidays. Use it to calculate how many business days remain until a deadline or between two events.",
		examples: ["=NETWORKDAYS(A2, B2, Holidays) returns the count of business days, skipping dates listed in the Holidays range."]
	},
	"networkdays.intl": {
		tier: 0,
		category: 2,
		tags: [],
		args: [
			[
				"start_date",
				"date",
				"First day of the period"
			],
			[
				"end_date",
				"date",
				"Last day of the period"
			],
			[
				"weekend*",
				"any",
				"Weekend number code or 7-character day mask; defaults to Saturday and Sunday"
			],
			[
				"holidays*",
				"range",
				"Optional list of dates to exclude as non-working days"
			]
		],
		description: "Like NETWORKDAYS, but lets you define which days of the week are the weekend using a mask or preset code. Use it for international teams where the weekend might be Friday–Saturday or another combination.",
		examples: ["=NETWORKDAYS.INTL(A2, B2, 7, Holidays) treats Friday and Saturday as the weekend."]
	},
	nominal: {
		tier: 0,
		category: 4,
		tags: [],
		args: [[
			"effect_rate",
			"number",
			"Effective annual interest rate as a decimal"
		], [
			"npery",
			"integer",
			"Number of compounding periods per year"
		]],
		description: "Returns the nominal annual interest rate given an effective rate and the number of compounding periods per year. The reverse of EFFECT - use it to back-calculate the stated rate from an observed effective rate.",
		examples: ["=NOMINAL(0.0512, 12) returns the nominal rate with monthly compounding."]
	},
	"norm.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value to evaluate"
			],
			[
				"mean",
				"number",
				"Arithmetic mean of the distribution"
			],
			[
				"standard_dev",
				"number",
				"Standard deviation (must be positive)"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution function; FALSE for the probability density"
			]
		],
		description: "Returns the normal distribution probability (CDF or PDF) for a given mean and standard deviation. Use it to find how likely a value is under a normal distribution - for instance, what fraction of products fall within spec.",
		examples: ["=NORM.DIST(75, 70, 10, TRUE) returns P(X ≤ 75) for a N(70, 10) distribution."]
	},
	"norm.inv": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Probability between 0 and 1 exclusive"
			],
			[
				"mean",
				"number",
				"Arithmetic mean of the distribution"
			],
			[
				"standard_dev",
				"number",
				"Standard deviation (must be positive)"
			]
		],
		description: "Returns the inverse of the normal CDF - the value at a given cumulative probability. Use it to find percentile values for any normal distribution.",
		examples: ["=NORM.INV(0.95, 70, 10) returns the 95th percentile of a N(70, 10) distribution."]
	},
	"norm.s.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"z",
			"number",
			"Standard normal z-score to evaluate"
		], [
			"cumulative",
			"logical",
			"TRUE for the cumulative distribution; FALSE for the probability density"
		]],
		description: "Returns the standard normal distribution probability (mean=0, standard deviation=1). Use it for z-table lookups - finding the probability that a standard normal variable is at most z.",
		examples: ["=NORM.S.DIST(1.96, TRUE) returns approximately 0.975."]
	},
	"norm.s.inv": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"probability",
			"number",
			"Probability between 0 and 1 exclusive"
		]],
		description: "Returns the inverse of the standard normal CDF - the z-score for a given cumulative probability. Use it to find critical z-values for confidence intervals and hypothesis tests.",
		examples: ["=NORM.S.INV(0.975) returns approximately 1.96."]
	},
	normdist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value to evaluate"
			],
			[
				"mean",
				"number",
				"Arithmetic mean of the distribution"
			],
			[
				"standard_dev",
				"number",
				"Standard deviation"
			],
			[
				"cumulative",
				"logical",
				"TRUE for cumulative distribution; FALSE for probability density"
			]
		],
		description: "Compatibility name for NORM.DIST. Prefer NORM.DIST in new formulas.",
		examples: ["=NORMDIST(42, 40, 1.5, TRUE) is equivalent to =NORM.DIST(42, 40, 1.5, TRUE)."]
	},
	norminv: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"probability",
				"number",
				"Probability between 0 and 1 exclusive"
			],
			[
				"mean",
				"number",
				"Arithmetic mean"
			],
			[
				"standard_dev",
				"number",
				"Standard deviation"
			]
		],
		description: "Compatibility name for NORM.INV. Prefer NORM.INV in new formulas.",
		examples: ["=NORMINV(0.9, 0, 1) is equivalent to =NORM.INV(0.9, 0, 1)."]
	},
	normsdist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"z",
			"number",
			"Standard normal z-score"
		]],
		description: "Compatibility name for NORM.S.DIST (cumulative form). Prefer NORM.S.DIST in new formulas.",
		examples: ["=NORMSDIST(1.96) is equivalent to =NORM.S.DIST(1.96, TRUE)."]
	},
	normsinv: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"probability",
			"number",
			"Probability between 0 and 1 exclusive"
		]],
		description: "Compatibility name for NORM.S.INV. Prefer NORM.S.INV in new formulas.",
		examples: ["=NORMSINV(0.975) is equivalent to =NORM.S.INV(0.975)."]
	},
	not: {
		tier: 0,
		category: 6,
		tags: [],
		args: [[
			"logical",
			"logical",
			"Value or expression to negate"
		]],
		description: "Reverses a logical value - TRUE becomes FALSE and FALSE becomes TRUE.",
		examples: ["=NOT(ISBLANK(A2)) returns TRUE when A2 has content."]
	},
	now: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"timezone*",
			"text",
			"Optional IANA timezone name to return the current time in that zone instead of the local time"
		]],
		description: "Returns the current date and time as a date-time serial number, recalculating on every worksheet change.",
		examples: ["=NOW()-A2 shows how many days (and fraction of a day) have passed since the date in A2."]
	},
	nper: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"pmt",
				"number",
				"Fixed payment per period"
			],
			[
				"pv",
				"number",
				"Present value"
			],
			[
				"fv*",
				"number",
				"Desired future value after the last payment; defaults to 0"
			],
			[
				"type*",
				"integer",
				"0 for end-of-period payments; 1 for beginning-of-period"
			]
		],
		description: "Returns the number of periods required to pay off a loan given a constant payment and interest rate. Use it to answer \"how many months until this loan is paid off?\" for any fixed-rate loan.",
		examples: ["=NPER(rate, pmt, pv) returns the number of payment periods."]
	},
	npv: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Discount rate per period"
			],
			[
				"value1*",
				"number_or_range",
				"First future cash flow"
			],
			[
				"...",
				"number_or_range",
				"Additional cash flows in chronological order"
			]
		],
		description: "Calculates the Net Present Value of a series of future cash flows discounted at a given rate. Use it to evaluate whether an investment creates value - if NPV is positive, the project earns more than the required rate. Note that the first cash flow is assumed to occur one period from now.",
		examples: ["=NPV(rate, value1, value2, ...) + initial_investment."]
	},
	numbervalue: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"Number represented as a text string"
			],
			[
				"decimal_separator*",
				"text",
				"Character used as the decimal point; defaults to the locale setting"
			],
			[
				"...",
				"text",
				"Character used as the thousands separator"
			]
		],
		description: "Converts a number stored as text to an actual number, letting you specify the decimal and thousands separators. Use it when importing data from locales that use commas as decimal separators.",
		examples: ["=NUMBERVALUE(\"1.234,56\", \",\", \".\") returns 1234.56."]
	},
	oct2bin: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"text",
			"Octal string to convert (up to 10 digits)"
		], [
			"places*",
			"integer",
			"Minimum width of the result, padded with leading zeros"
		]],
		description: "Converts an octal number to binary. Use it in computing contexts where you need to inspect the bits of an octal value.",
		examples: ["=OCT2BIN(\"7\") returns \"111\"."]
	},
	oct2dec: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"text",
			"Octal string to convert to decimal"
		]],
		description: "Converts an octal number to decimal. Use it when working with Unix permissions (e.g., \"755\") or other octal-notated values that you need to calculate with.",
		examples: ["=OCT2DEC(\"17\") returns 15."]
	},
	oct2hex: {
		tier: 0,
		category: 3,
		tags: [],
		args: [[
			"number",
			"text",
			"Octal string to convert"
		], [
			"places*",
			"integer",
			"Minimum width of the result, padded with leading zeros"
		]],
		description: "Converts an octal number to hexadecimal. A utility for moving between number systems when both appear in the same data.",
		examples: ["=OCT2HEX(\"77\") returns \"3F\"."]
	},
	odd: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round up to the nearest odd integer away from zero"
		]],
		description: "Rounds a number up to the nearest odd integer. Use it when you need to ensure a value is odd - for example, certain packaging, layout, or algorithm requirements.",
		examples: ["=ODD(4) returns 5; =ODD(-4) returns -5."]
	},
	oddfprice: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"issue",
				"date",
				"Issue date of the security"
			],
			[
				"first_coupon",
				"date",
				"First coupon date of the security"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"yld",
				"number",
				"Annual yield as a decimal"
			],
			[
				"redemption",
				"number",
				"Redemption value per $100 face value"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the price per $100 face value of a security whose first period is odd, meaning the first coupon covers a shorter or longer span than the regular ones. Use it for bonds issued between coupon dates, where PRICE would misstate the value.",
		examples: ["=ODDFPRICE(A2, B2, C2, D2, 0.05, 0.04, 100, 2, 0) prices a bond with a short first coupon."]
	},
	oddfyield: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"issue",
				"date",
				"Issue date of the security"
			],
			[
				"first_coupon",
				"date",
				"First coupon date of the security"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"pr",
				"number",
				"Price per $100 face value"
			],
			[
				"redemption",
				"number",
				"Redemption value per $100 face value"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the annual yield of a security whose first period is odd, meaning the first coupon covers a shorter or longer span than the regular ones. It is the inverse of ODDFPRICE: the yield at which the bond's cash flows discount back to pr.",
		examples: ["=ODDFYIELD(A2, B2, C2, D2, 0.05, 98, 100, 2, 0) returns the yield of a bond with a short first coupon bought below par."]
	},
	oddlprice: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"last_interest",
				"date",
				"Last coupon date of the security"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"yld",
				"number",
				"Annual yield as a decimal"
			],
			[
				"redemption",
				"number",
				"Redemption value per $100 face value"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the price per $100 face value of a security whose last period is odd, meaning the final coupon covers a shorter or longer span than the regular ones. Use it for bonds that mature between coupon dates, where PRICE would misstate the value.",
		examples: ["=ODDLPRICE(A2, B2, C2, 0.05, 0.04, 100, 2, 0) prices a bond with an irregular final coupon."]
	},
	oddlyield: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"last_interest",
				"date",
				"Last coupon date of the security"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"pr",
				"number",
				"Price per $100 face value"
			],
			[
				"redemption",
				"number",
				"Redemption value per $100 face value"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the annual yield of a security whose last period is odd, meaning the final coupon covers a shorter or longer span than the regular ones. It is the inverse of ODDLPRICE: the yield implied by buying the bond at pr and holding it to maturity.",
		examples: ["=ODDLYIELD(A2, B2, C2, 0.05, 98, 100, 2, 0) returns the yield of a bond with an irregular final coupon bought below par."]
	},
	offset: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"reference",
				"reference",
				"Starting cell or range"
			],
			[
				"rows*",
				"integer",
				"Rows to move down; negative moves up"
			],
			[
				"cols*",
				"integer",
				"Columns to move right; negative moves left"
			],
			[
				"height*",
				"integer",
				"Height of the returned range in rows; defaults to the height of reference"
			],
			[
				"...",
				"integer",
				"Width of the returned range in columns; defaults to the width of reference"
			]
		],
		description: "Returns a reference shifted a specified number of rows and columns from a starting cell, with an optional width and height. Use it to build dynamic ranges whose size or position changes based on inputs - for instance, a rolling 12-month window.",
		examples: ["=SUM(OFFSET(A1, 0, 0, 12, 1)) sums a 12-row column starting at A1."]
	},
	or: {
		tier: 0,
		category: 6,
		tags: [],
		args: [[
			"logical1",
			"logical",
			"First condition to test"
		], [
			"...",
			"logical",
			"Additional conditions; returns TRUE if any is TRUE"
		]],
		description: "Returns TRUE if any of its arguments evaluates to TRUE, FALSE only if all are FALSE. Use it to check whether at least one of several conditions holds - for example, flagging rows that belong to any of a set of categories.",
		examples: ["=OR(A2=\"East\", A2=\"West\") returns TRUE for either region."]
	},
	pduration: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"pv",
				"number",
				"Current (present) value"
			],
			[
				"fv",
				"number",
				"Target future value"
			]
		],
		description: "Returns the number of periods required for an investment to reach a target value at a given interest rate. Use it to answer \"how long will it take for my investment to double?\" at a given return rate.",
		examples: ["=PDURATION(rate, pv, fv) returns the number of periods needed."]
	},
	pearson: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array1",
			"number_or_range",
			"First dataset"
		], [
			"array2",
			"number_or_range",
			"Second dataset, same size as array1"
		]],
		description: "Returns the Pearson product-moment correlation coefficient between two datasets. Functionally identical to CORREL - use either one to measure the linear relationship between two variables.",
		examples: ["=PEARSON(A2:A50, B2:B50) returns the correlation coefficient."]
	},
	percentile: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"array",
			"number_or_range",
			"Data values"
		], [
			"k",
			"number",
			"Percentile between 0 and 1 inclusive"
		]],
		description: "Compatibility name for PERCENTILE.INC. Prefer PERCENTILE.INC in new formulas.",
		examples: ["=PERCENTILE(A2:A20, 0.9) is equivalent to =PERCENTILE.INC(A2:A20, 0.9)."]
	},
	"percentile.exc": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array",
			"number_or_range",
			"Data values"
		], [
			"k",
			"number",
			"Percentile between 0 and 1 exclusive"
		]],
		description: "Returns the k-th percentile of a dataset, excluding the 0th and 100th percentiles. More conservative than PERCENTILE.INC for boundary values.",
		examples: ["=PERCENTILE.EXC(A2:A20, 0.9) returns the 90th percentile, excluding extremes."]
	},
	"percentile.inc": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array",
			"number_or_range",
			"Data values"
		], [
			"k",
			"number",
			"Percentile between 0 and 1 inclusive"
		]],
		description: "Returns the k-th percentile of a dataset, including the 0th (minimum) and 100th (maximum) percentiles.",
		examples: ["=PERCENTILE.INC(A2:A20, 0.9) returns the 90th percentile."]
	},
	percentof: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"data_subset",
			"number_or_range",
			"The values making up the subset"
		], [
			"data_all",
			"number_or_range",
			"The values making up the whole set"
		]],
		description: "Returns the share a subset represents of a whole, equivalent to =SUM(data_subset)/SUM(data_all). Mostly used inside GROUPBY and PIVOTBY. The result is a fraction, so format the cell as a percentage.",
		examples: ["=PERCENTOF(B2:B5, B2:B20) returns the share the first four values contribute to the whole range."]
	},
	percentrank: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"array",
				"number_or_range",
				"Data values"
			],
			[
				"x",
				"number",
				"Value whose rank to find"
			],
			[
				"significance*",
				"integer",
				"Decimal places in the result; defaults to 3"
			]
		],
		description: "Compatibility name for PERCENTRANK.INC. Prefer PERCENTRANK.INC in new formulas.",
		examples: ["=PERCENTRANK(A2:A20, 75) is equivalent to =PERCENTRANK.INC(A2:A20, 75)."]
	},
	"percentrank.exc": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"array",
				"number_or_range",
				"Data values"
			],
			[
				"x",
				"number",
				"Value whose rank to find"
			],
			[
				"significance*",
				"integer",
				"Number of decimal places in the result; defaults to 3"
			]
		],
		description: "Returns the rank of a value as a percentage of the dataset, excluding 0% and 100%.",
		examples: ["=PERCENTRANK.EXC(A2:A20, 75) returns the percentile rank of 75 within the range."]
	},
	"percentrank.inc": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"array",
				"number_or_range",
				"Data values"
			],
			[
				"x",
				"number",
				"Value whose rank to find"
			],
			[
				"significance*",
				"integer",
				"Number of decimal places in the result; defaults to 3"
			]
		],
		description: "Returns the rank of a value as a percentage (0% to 100%) of the dataset.",
		examples: ["=PERCENTRANK.INC(A2:A20, 75) returns the percentile rank of 75."]
	},
	permut: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number",
			"integer",
			"Total number of objects"
		], [
			"number_chosen",
			"integer",
			"Number of objects selected, where order matters"
		]],
		description: "Returns the number of ordered arrangements (permutations) of a given number of objects chosen from a set, without repetition.",
		examples: ["=PERMUT(10, 3) returns 720, the number of ways to arrange 3 items from 10."]
	},
	permutationa: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number",
			"integer",
			"Total number of objects"
		], [
			"number_chosen",
			"integer",
			"Number of objects to select, where order matters and repetition is allowed"
		]],
		description: "Returns the number of ordered arrangements with repetition allowed — each object can be chosen more than once.",
		examples: ["=PERMUTATIONA(3, 2) returns 9, because each of 2 positions can hold any of 3 values."]
	},
	phi: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"x",
			"number",
			"Value at which to evaluate the standard normal probability density function"
		]],
		description: "Returns the value of the standard normal probability density function at a given z-value. Use it in mathematical and statistical derivations where the normal PDF is needed directly.",
		examples: ["=PHI(0) returns approximately 0.3989 (the peak of the bell curve)."]
	},
	pi: {
		tier: 0,
		category: 8,
		tags: [],
		args: [],
		description: "Returns the mathematical constant π (approximately 3.14159265358979). Use it in any formula involving circles, angles, or trigonometry where π is needed.",
		examples: ["=PI()*r^2 computes the area of a circle with radius r."]
	},
	pmt: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"nper",
				"integer",
				"Total number of payment periods"
			],
			[
				"pv",
				"number",
				"Present value (loan amount)"
			],
			[
				"fv*",
				"number",
				"Desired balance after the last payment; defaults to 0"
			],
			[
				"type*",
				"integer",
				"0 for end-of-period payments; 1 for beginning-of-period"
			]
		],
		description: "Calculates the fixed periodic payment required to fully amortize a loan at a constant interest rate. Use it to determine monthly mortgage or car loan payments before committing to a loan.",
		examples: ["=PMT(5%/12, 360, -200000) returns the monthly payment for a $200,000 mortgage at 5% over 30 years."]
	},
	poisson: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"x",
				"integer",
				"Number of events"
			],
			[
				"mean",
				"number",
				"Expected number of events (lambda)"
			],
			[
				"cumulative",
				"logical",
				"TRUE for cumulative distribution; FALSE for exact probability"
			]
		],
		description: "Compatibility name for POISSON.DIST. Prefer POISSON.DIST in new formulas.",
		examples: ["=POISSON(4, 3, FALSE) is equivalent to =POISSON.DIST(4, 3, FALSE)."]
	},
	"poisson.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"integer",
				"Number of events to evaluate the probability for"
			],
			[
				"mean",
				"number",
				"Expected average number of events"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution function; FALSE for the probability mass function"
			]
		],
		description: "Returns the Poisson distribution probability for a given number of events and average rate. Use it to model the probability of a count of rare, independent events - customer arrivals, server requests, or defects per unit.",
		examples: ["=POISSON.DIST(3, 5, FALSE) returns P(X=3) when the average is 5 events."]
	},
	power: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Base value"
		], [
			"power",
			"number",
			"Exponent to raise the base to"
		]],
		description: "Returns a number raised to a given power - equivalent to the ^ operator but sometimes clearer in complex formulas. Use it for any exponentiation: squaring values, computing compound growth, or applying a known power law.",
		examples: ["=POWER(2, 10) returns 1024."]
	},
	ppmt: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"per",
				"integer",
				"Period number to calculate the principal portion for (1-based)"
			],
			[
				"nper",
				"integer",
				"Total number of payment periods"
			],
			[
				"pv",
				"number",
				"Present value of the loan"
			],
			[
				"fv*",
				"number",
				"Desired balance after the last payment; defaults to 0"
			],
			[
				"type*",
				"integer",
				"0 for end-of-period payments; 1 for beginning-of-period"
			]
		],
		description: "Returns the principal portion of a specific loan payment. Use it alongside IPMT to understand how much of a given payment reduces the outstanding balance.",
		examples: ["=PPMT(rate, period, nper, pv) returns the principal for that period."]
	},
	price: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"yld",
				"number",
				"Annual yield as a decimal"
			],
			[
				"redemption",
				"number",
				"Redemption value per $100 face value"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the price per $100 face value of a security that pays periodic interest. Use it to value a coupon bond at a given yield: the price comes out above 100 when the coupon beats the yield, and below when it trails.",
		examples: ["=PRICE(A2, B2, 0.05, 0.04, 100, 2, 0) prices a semiannual bond yielding less than its coupon."]
	},
	pricedisc: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"discount",
				"number",
				"Discount rate as a decimal"
			],
			[
				"redemption",
				"number",
				"Redemption value per $100 face value"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the price per $100 face value of a discounted security (one that pays no coupon and is sold below its redemption value).",
		examples: ["=PRICEDISC(A2, B2, 0.04, 100, 0) returns the price of a T-bill with a 4% discount rate."]
	},
	pricemat: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"issue",
				"date",
				"Issue date of the security"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"yld",
				"number",
				"Annual yield as a decimal"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the price per $100 face value of a security that pays interest only at maturity rather than periodically.",
		examples: ["=PRICEMAT(A2, B2, C2, 0.05, 0.04, 0) prices a maturity-interest security."]
	},
	prob: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x_range",
				"range",
				"Values whose probabilities you know"
			],
			[
				"prob_range",
				"range",
				"Probabilities corresponding to each value in x_range"
			],
			[
				"lower_limit",
				"number",
				"Lower bound of the range to sum probabilities for"
			],
			[
				"upper_limit*",
				"number",
				"Upper bound; if omitted, returns the probability that x equals lower_limit"
			]
		],
		description: "Returns the probability that a value in x_range falls within a specified interval, given a set of discrete probability weights.",
		examples: ["=PROB(A2:A6, B2:B6, 2, 4) returns the total probability of values between 2 and 4."]
	},
	product: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range to multiply"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Multiplies all numbers in a list together and returns the result. Use it to find the product of a range - for instance, computing compound growth over multiple periods by multiplying a series of growth factors.",
		examples: ["=PRODUCT(A2:A10) multiplies all values in the range."]
	},
	proper: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String to convert to title case (first letter of each word capitalised)"
		]],
		description: "Capitalizes the first letter of each word in a text string and lowercases the rest. Use it to standardize names and titles that arrived in inconsistent case - all-caps, all-lowercase, or random mixed case.",
		examples: ["=PROPER(\"john smith\") returns \"John Smith\"."]
	},
	pv: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Interest rate per period"
			],
			[
				"nper",
				"integer",
				"Total number of payment periods"
			],
			[
				"pmt",
				"number",
				"Fixed payment made each period"
			],
			[
				"fv*",
				"number",
				"Future value after the last payment; defaults to 0"
			],
			[
				"type*",
				"integer",
				"0 for end-of-period payments; 1 for beginning-of-period"
			]
		],
		description: "Returns the present value of a series of future payments discounted at a constant rate. Use it to answer \"what is a stream of future payments worth today?\" - for loan valuations, annuity pricing, or lease analysis.",
		examples: ["=PV(rate, nper, pmt) returns the lump-sum equivalent value today."]
	},
	quartile: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"array",
			"number_or_range",
			"Data values"
		], [
			"quart",
			"integer",
			"Quartile to return: 0=min, 1=25th, 2=50th, 3=75th, 4=max"
		]],
		description: "Compatibility name for QUARTILE.INC. Prefer QUARTILE.INC in new formulas.",
		examples: ["=QUARTILE(A2:A20, 1) is equivalent to =QUARTILE.INC(A2:A20, 1)."]
	},
	"quartile.exc": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array",
			"number_or_range",
			"Data values"
		], [
			"quart",
			"integer",
			"Quartile to return: 1=25th, 2=50th, 3=75th percentile (exclusive)"
		]],
		description: "Returns the specified quartile of a dataset, excluding the 0th and 4th quartiles (min and max).",
		examples: ["=QUARTILE.EXC(A2:A20, 1) returns the first quartile (25th percentile, exclusive)."]
	},
	"quartile.inc": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array",
			"number_or_range",
			"Data values"
		], [
			"quart",
			"integer",
			"Quartile to return: 0=min, 1=25th, 2=50th, 3=75th, 4=max"
		]],
		description: "Returns the specified quartile of a dataset, including min (0) and max (4).",
		examples: ["=QUARTILE.INC(A2:A20, 1) returns the 25th percentile."]
	},
	quotient: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"numerator",
			"number",
			"Dividend"
		], [
			"denominator",
			"number",
			"Divisor"
		]],
		description: "Returns the integer portion of a division result, discarding the remainder. Use it when you only want the whole-number quotient without dealing with decimals.",
		examples: ["=QUOTIENT(10, 3) returns 3 (10 ÷ 3 = 3 remainder 1)."]
	},
	radians: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"angle",
			"number",
			"Angle in degrees to convert to radians"
		]],
		description: "Converts an angle from degrees to radians. Use it before passing degree values to trigonometric functions (SIN, COS, TAN), which expect radians.",
		examples: ["=RADIANS(180) returns π ≈ 3.14159."]
	},
	rand: {
		tier: 0,
		category: 8,
		tags: [],
		args: [],
		description: "Returns a random number between 0 (inclusive) and 1 (exclusive), recalculated on every worksheet change. Use it to generate random values for simulations or random sampling.",
		examples: ["=INT(RAND()*100)+1 returns a random integer from 1 to 100."]
	},
	randarray: {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"rows",
				"integer",
				"Number of rows in the output array"
			],
			[
				"columns*",
				"integer",
				"Number of columns; defaults to 1"
			],
			[
				"min*",
				"number",
				"Minimum value; defaults to 0"
			],
			[
				"max*",
				"number",
				"Maximum value; defaults to 1"
			],
			[
				"...",
				"logical",
				"TRUE to return integers; FALSE for decimals (default)"
			]
		],
		description: "Returns a two-dimensional array of random numbers between specified minimum and maximum values. Use it to fill a range with random data for simulations or testing - all values generated at once with a single formula.",
		examples: ["=RANDARRAY(5, 3, 1, 100, TRUE) fills a 5×3 block with random integers from 1 to 100."]
	},
	randbetween: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"bottom",
			"integer",
			"Smallest integer that can be returned"
		], [
			"top",
			"integer",
			"Largest integer that can be returned"
		]],
		description: "Returns a random integer between two specified values (inclusive), recalculated on every change. Use it to simulate dice rolls, random assignment, or integer random sampling.",
		examples: ["=RANDBETWEEN(1, 6) simulates rolling a six-sided die."]
	},
	rank: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"number",
				"number",
				"Value to rank"
			],
			[
				"ref",
				"range",
				"List of numbers to rank against"
			],
			[
				"order*",
				"integer",
				"0 or omitted=descending; any other value=ascending"
			]
		],
		description: "Compatibility name for RANK.EQ. Prefer RANK.EQ in new formulas.",
		examples: ["=RANK(A2, A2:A10) is equivalent to =RANK.EQ(A2, A2:A10)."]
	},
	"rank.avg": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"number",
				"number",
				"Value to rank"
			],
			[
				"ref",
				"range",
				"List of numbers to rank against"
			],
			[
				"order*",
				"integer",
				"0 or omitted ranks in descending order; any other value ranks ascending"
			]
		],
		description: "Returns the rank of a number within a list, averaging the rank when ties occur. Use it for fair ranking where you want tied values to share the average of their positions rather than one getting an arbitrary advantage.",
		examples: ["=RANK.AVG(A2, A$2:A$100, 0) returns A2's rank in descending order."]
	},
	"rank.eq": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"number",
				"number",
				"Value to rank"
			],
			[
				"ref",
				"range",
				"List of numbers to rank against"
			],
			[
				"order*",
				"integer",
				"0 or omitted ranks descending; any other value ranks ascending"
			]
		],
		description: "Returns the rank of a number within a list; all tied values receive the top rank in the group. Use it for traditional ranking where tied values claim the same (highest) position in the tie.",
		examples: ["=RANK.EQ(A2, A$2:A$100, 0) returns A2's descending rank."]
	},
	rate: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"nper",
				"integer",
				"Total number of payment periods"
			],
			[
				"pmt",
				"number",
				"Fixed payment per period"
			],
			[
				"pv",
				"number",
				"Present value"
			],
			[
				"fv*",
				"number",
				"Future value after the last payment; defaults to 0"
			],
			[
				"type*",
				"integer",
				"0 for end-of-period payments; 1 for beginning-of-period"
			],
			[
				"guess*",
				"number",
				"Starting estimate for the rate; defaults to 0.1"
			]
		],
		description: "Calculates the periodic interest rate of an annuity given the number of periods, payment amount, and present value. Use it to determine the implied interest rate on a loan when you know the payment schedule.",
		examples: ["=RATE(nper, pmt, pv) returns the per-period rate; multiply by 12 for an annual figure."]
	},
	received: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"investment",
				"number",
				"Amount invested at settlement"
			],
			[
				"discount",
				"number",
				"Discount rate as a decimal"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the total amount received at maturity for a fully invested security — the original investment grown by the discount rate over the holding period.",
		examples: ["=RECEIVED(A2, B2, 1000, 0.04, 0) returns what you collect when the security matures."]
	},
	reduce: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"initial_value",
				"any",
				"Starting value for the accumulator"
			],
			[
				"array",
				"array",
				"Array or range to iterate over"
			],
			[
				"...",
				"function",
				"LAMBDA(accumulator, value) that returns the new accumulator; the final accumulator is the result"
			]
		],
		description: "Applies a LAMBDA iteratively over an array to accumulate a single result, returning only the final value. Use it to build custom aggregations - like summing only values above a threshold - that no built-in aggregate handles.",
		examples: ["=REDUCE(0, A2:A10, LAMBDA(acc, x, IF(x>100, acc+x, acc))) sums only values over 100."]
	},
	regexextract: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"String to search in"
			],
			[
				"pattern",
				"text",
				"Regular expression pattern to match"
			],
			[
				"return_mode*",
				"integer",
				"0=first match (default), 1=all matches, 2=capture groups"
			],
			[
				"...",
				"integer",
				"Which occurrence to return when return_mode is 0"
			]
		],
		description: "Extracts the first substring that matches a regular expression pattern from a text string. Use it to pull structured data out of free-form text - phone numbers, postal codes, dates - without complex nested formulas.",
		examples: ["=REGEXEXTRACT(A2, \"\\d{5}\") returns the first 5-digit sequence in A2."]
	},
	regexreplace: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"String to modify"
			],
			[
				"pattern",
				"text",
				"Regular expression pattern to find"
			],
			[
				"replacement",
				"text",
				"Replacement string; use \\1, \\2 etc. for capture group references"
			],
			[
				"occurrence*",
				"integer",
				"Which match to replace; 0 or omitted replaces all"
			],
			[
				"case_sensitivity*",
				"integer",
				"0=case-sensitive (default), 1=case-insensitive"
			]
		],
		description: "Replaces substrings that match a regular expression pattern with a replacement string. Use it for advanced find-and-replace operations that plain SUBSTITUTE can't handle - removing all punctuation, replacing multiple patterns at once, or manipulating structured text.",
		examples: ["=REGEXREPLACE(A2, \"[^a-zA-Z0-9]\", \"\") strips all non-alphanumeric characters."]
	},
	regextest: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"String to test"
			],
			[
				"pattern",
				"text",
				"Regular expression pattern to test against"
			],
			[
				"case_sensitivity*",
				"integer",
				"0=case-sensitive (default), 1=case-insensitive"
			]
		],
		description: "Returns TRUE if a text string contains a match for a regular expression pattern. Use it to validate data formats - checking whether a cell holds a valid email, phone number, or date pattern - without extracting the value.",
		examples: ["=REGEXTEST(A2, \"^\\d{5}(-\\d{4})?$\") returns TRUE for a valid US ZIP code."]
	},
	replace: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"old_text",
				"text",
				"Original string"
			],
			[
				"start_num",
				"integer",
				"1-based position of the first character to replace"
			],
			[
				"num_chars",
				"integer",
				"Number of characters to remove from old_text"
			],
			[
				"new_text",
				"text",
				"String to insert in place of the removed characters"
			]
		],
		description: "Replaces a specified number of characters at a given position in a text string with a new string. Use it when you know the exact position of what you want to replace - updating a fixed-format code field or inserting a character at a known offset.",
		examples: ["=REPLACE(A2, 4, 2, \"XX\") replaces characters 4–5 with \"XX\"."]
	},
	replaceb: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"old_text",
				"text",
				"Original string"
			],
			[
				"start_num",
				"integer",
				"1-based position of the first character to replace"
			],
			[
				"num_chars",
				"integer",
				"Number of characters to remove from old_text"
			],
			[
				"new_text",
				"text",
				"String to insert in place of the removed characters"
			]
		],
		description: "Replaces part of a text string with another string. Equivalent to REPLACE; provided for compatibility with double-byte (East Asian) locales.",
		examples: ["=REPLACEB(A2, 3, 2, \"AB\") replaces 2 characters starting at position 3."]
	},
	rept: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String to repeat"
		], [
			"number_times",
			"integer",
			"Number of times to repeat the string"
		]],
		description: "Repeats a text string a specified number of times. Use it to build simple in-cell bar charts, pad strings to a fixed width, or create repeated separator patterns inside a formula.",
		examples: ["=REPT(\"|\", A2) creates a bar whose length matches the value in A2."]
	},
	right: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"Source string"
		], [
			"...",
			"integer",
			"Number of characters to extract from the end; defaults to 1"
		]],
		description: "Returns the specified number of characters from the end of a text string. Use it to extract a suffix - the last four digits of an account number, a file extension, or a trailing code.",
		examples: ["=RIGHT(A2, 4) returns the last 4 characters."]
	},
	rightb: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"Source string"
		], [
			"num_chars*",
			"integer",
			"How many characters to take from the end; defaults to 1 when omitted"
		]],
		description: "Returns the last characters of a text string. Equivalent to RIGHT; provided for compatibility with double-byte (East Asian) locales.",
		examples: ["=RIGHTB(A2, 4) returns the rightmost 4 characters."]
	},
	roman: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"integer",
			"Positive integer to convert to a Roman numeral"
		], [
			"...",
			"integer",
			"Style: 0=classic (default), 1 through 4 progressively abbreviate"
		]],
		description: "Converts an Arabic number to Roman numeral notation, returned as text. Use it to format numbers in classical style for titles, outlines, or documents where Roman numerals are conventional.",
		examples: ["=ROMAN(2024) returns \"MMXXIV\"."]
	},
	round: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round"
		], [
			"num_digits",
			"integer",
			"Decimal places to round to; negative rounds left of the decimal point"
		]],
		description: "Rounds a number to a specified number of decimal places, using standard rounding (≥0.5 rounds up). Use it to control precision in financial totals, measurements, or any calculated value shown to users.",
		examples: ["=ROUND(3.14159, 2) returns 3.14."]
	},
	rounddown: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round toward zero"
		], [
			"num_digits",
			"integer",
			"Decimal places to keep; negative rounds left of the decimal point"
		]],
		description: "Rounds a number toward zero to a specified number of decimal places - always rounding down regardless of the digit that follows. Use it when you always want the more conservative value.",
		examples: ["=ROUNDDOWN(3.79, 1) returns 3.7."]
	},
	roundup: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to round away from zero"
		], [
			"num_digits",
			"integer",
			"Decimal places to keep; negative rounds left of the decimal point"
		]],
		description: "Rounds a number away from zero to a specified number of decimal places - always rounding up regardless of the digit that follows. Use it when you always want to round conservatively upward.",
		examples: ["=ROUNDUP(3.21, 1) returns 3.3."]
	},
	row: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"reference",
			"reference",
			"Cell or range whose row number to return; uses the formula cell if omitted"
		]],
		description: "Returns the row number of a reference (or the current cell if no reference is given). Use it to generate row-number sequences, add a row-number column, or control array formula behavior.",
		examples: ["=ROW(A5) returns 5; =ROW() in cell B3 returns 3."]
	},
	rows: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"array",
			"array",
			"Range or array whose row count you want"
		]],
		description: "Returns the number of rows in a range or array. Use it to find the height of a dynamic range, or when you need to loop over all rows in a computed result.",
		examples: ["=ROWS(A1:A10) returns 10."]
	},
	rri: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"nper",
				"integer",
				"Number of periods"
			],
			[
				"pv",
				"number",
				"Present value"
			],
			[
				"fv",
				"number",
				"Future value"
			]
		],
		description: "Returns the equivalent interest rate needed to grow an investment from a present value to a future value over a number of periods. Use it to calculate a Compound Annual Growth Rate (CAGR).",
		examples: ["=RRI(5, 100, 150) returns the per-period growth rate over 5 periods."]
	},
	rsq: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"known_ys",
			"number_or_range",
			"Dependent (y) data points"
		], [
			"known_xs",
			"number_or_range",
			"Independent (x) data points, same count as known_ys"
		]],
		description: "Returns the square of the Pearson correlation coefficient (R²) - the proportion of variance in y explained by x. Use it to evaluate how well a linear regression fits your data; R²=1 means a perfect fit.",
		examples: ["=RSQ(B2:B20, A2:A20) returns R² for the linear relationship."]
	},
	scan: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"initial_value",
				"any",
				"Starting accumulator value"
			],
			[
				"array",
				"array",
				"Array or range to iterate over"
			],
			[
				"...",
				"function",
				"LAMBDA(accumulator, value) that returns the new accumulator; each intermediate accumulator is collected into the output array"
			]
		],
		description: "Like REDUCE, but returns an array showing the accumulated value after each step rather than just the final result. Use it to create running totals or cumulative calculations where you want to see every intermediate value.",
		examples: ["=SCAN(0, A2:A10, LAMBDA(acc, x, acc+x)) returns the running sum at each row."]
	},
	search: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"find_text",
				"text",
				"Substring to locate; supports the wildcards ? and *"
			],
			[
				"within_text",
				"text",
				"String to search inside"
			],
			[
				"...",
				"integer",
				"1-based character position to start from; defaults to 1"
			]
		],
		description: "Returns the position of one text string within another, case-insensitively, with support for the wildcards ? (any single character) and * (any sequence). Use it for flexible substring searches when the exact capitalization of the target may vary.",
		examples: ["=SEARCH(\"ap*e\", A2) finds \"apple\", \"ape\", or \"Appetite\" in A2."]
	},
	searchb: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"find_text",
				"text",
				"Substring to locate; supports the wildcards ? and *"
			],
			[
				"within_text",
				"text",
				"String to search inside"
			],
			[
				"start_num*",
				"integer",
				"1-based character position to start from; defaults to 1"
			]
		],
		description: "Finds the position of one text string within another, case-insensitively, with support for the wildcards ? and *. Equivalent to SEARCH; provided for compatibility with double-byte (East Asian) locales.",
		examples: ["=SEARCHB(\"A\", A2) returns the position of the first case-insensitive match of \"A\"."]
	},
	sec: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Angle in radians"
		]],
		description: "Returns the secant of an angle in radians (1 divided by cosine). A trigonometric function used in geometry and physics.",
		examples: ["=SEC(0) returns 1."]
	},
	sech: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Any real number"
		]],
		description: "Returns the hyperbolic secant of a number. Used in advanced mathematical and physical analysis.",
		examples: ["=SECH(1) returns approximately 0.648."]
	},
	second: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"serial_number",
			"date_or_time",
			"Time or date-time value from which to extract the seconds (0-59)"
		]],
		description: "Extracts the seconds component (0–59) from a time value. Useful for precise time analysis - for example, checking whether a process completed within an expected number of seconds.",
		examples: ["=SECOND(A2) returns 45 if A2 contains 10:15:45."]
	},
	sequence: {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"rows",
				"integer",
				"Number of rows in the output array"
			],
			[
				"columns*",
				"integer",
				"Number of columns; defaults to 1"
			],
			[
				"start*",
				"number",
				"First value in the sequence; defaults to 1"
			],
			[
				"...",
				"number",
				"Step between consecutive values; defaults to 1"
			]
		],
		description: "Generates a two-dimensional array of sequential numbers with a specified start and step. Use it to fill a range with a number series without dragging or entering values manually.",
		examples: ["=SEQUENCE(5, 1, 1, 2) returns 1, 3, 5, 7, 9 in a column."]
	},
	seriessum: {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value fed into the power series"
			],
			[
				"n",
				"number",
				"Starting exponent applied to x"
			],
			[
				"m",
				"number",
				"Amount the exponent grows by for each successive term"
			],
			[
				"coefficients",
				"range",
				"Multipliers for each term; the count determines how many terms the series has"
			]
		],
		description: "Returns the sum of a power series: Σ aᵢ × x^(n+m×i). Use it in engineering and mathematics to evaluate polynomial approximations of functions.",
		examples: ["=SERIESSUM(x, 0, 1, coefficients) evaluates the polynomial at x using the given coefficient array."]
	},
	sheet: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"...",
			"any",
			"Sheet name or reference whose index to return; returns the current sheet index if omitted"
		]],
		description: "Returns the sheet number of a reference or the current sheet if no argument is given. Use it to identify which sheet a reference belongs to or to build formulas that react to their position in the workbook.",
		examples: ["=SHEET() returns the index number of the current sheet."]
	},
	sheets: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"...",
			"reference",
			"Reference whose sheet count to return; returns the total workbook sheet count if omitted"
		]],
		description: "Returns the total number of sheets in a workbook, or the number of sheets covered by a 3D reference. Use it to build dynamic formulas that adapt when sheets are added or removed.",
		examples: ["=SHEETS() returns how many sheets the workbook contains."]
	},
	sign: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value whose sign to return: -1 for negative, 0 for zero, 1 for positive"
		]],
		description: "Returns 1 if a number is positive, −1 if negative, and 0 if zero. Use it to determine the direction of a value without caring about its magnitude - for instance, to check whether a change is an increase or decrease.",
		examples: ["=SIGN(-5) returns -1; =SIGN(0) returns 0."]
	},
	sin: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Angle in radians"
		]],
		description: "Returns the sine of an angle given in radians. Core trigonometric function used in geometry, physics, signal processing, and engineering.",
		examples: ["=SIN(PI()/2) returns 1 (sine of 90°)."]
	},
	sinh: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Any real number"
		]],
		description: "Returns the hyperbolic sine of a number. Used in engineering and physics - for instance, in calculations involving hanging cables (catenary) and heat transfer.",
		examples: ["=SINH(1) returns approximately 1.175."]
	},
	skew: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the skewness of a distribution - a measure of asymmetry around the mean. Positive skew means a longer right tail; negative means a longer left tail. Use it to check whether data is approximately symmetric before applying methods that assume normality.",
		examples: ["=SKEW(A2:A100) returns the sample skewness."]
	},
	"skew.p": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range (treats data as the whole population)"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the population skewness, dividing by n instead of n−1. Use it when your data represents the entire population rather than a sample.",
		examples: ["=SKEW.P(A2:A100)."]
	},
	sln: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"cost",
				"number",
				"Initial cost of the asset"
			],
			[
				"salvage",
				"number",
				"Residual value at the end of its useful life"
			],
			[
				"life",
				"integer",
				"Number of periods in the asset's useful life"
			]
		],
		description: "Returns the straight-line depreciation of an asset for one period. Use it when accounting rules require equal depreciation charges every year over the asset's useful life.",
		examples: ["=SLN(10000, 1000, 5) returns $1,800 per year for a $10,000 asset with $1,000 salvage value and a 5-year life."]
	},
	slope: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"known_ys",
			"number_or_range",
			"Dependent (y) data points"
		], [
			"known_xs",
			"number_or_range",
			"Independent (x) data points, same count as known_ys"
		]],
		description: "Returns the slope of the linear regression line through a set of data points - how much y changes for each unit increase in x. Use it with INTERCEPT to build a simple linear model for prediction or trend analysis.",
		examples: ["=SLOPE(B2:B20, A2:A20) returns the slope coefficient."]
	},
	small: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array",
			"number_or_range",
			"Values to search"
		], [
			"k",
			"integer",
			"Rank from the bottom (1 returns the minimum)"
		]],
		description: "Returns the k-th smallest value in a dataset. Use it to find bottom-N values - the second-lowest, third-cheapest - without sorting the data.",
		examples: ["=SMALL(A2:A100, 2) returns the second-smallest value."]
	},
	sort: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Array or range to sort"
			],
			[
				"sort_index*",
				"integer",
				"Column (or row) index to sort by; defaults to 1"
			],
			[
				"sort_order*",
				"integer",
				"1 for ascending (default), -1 for descending"
			],
			[
				"...",
				"logical",
				"TRUE to sort by row instead of by column"
			]
		],
		description: "Returns a sorted copy of an array based on one or more columns, in ascending or descending order. Use it to present data in order without disturbing the source - the result spills automatically and updates as data changes.",
		examples: ["=SORT(A2:B20, 2, -1) sorts by column B in descending order."]
	},
	sortby: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Array or range to sort"
			],
			[
				"by_array*",
				"array",
				"Array to sort on (same height as array for row sort)"
			],
			[
				"sort_order*",
				"integer",
				"1 for ascending, -1 for descending"
			],
			[
				"...",
				"any",
				"Additional sort-key/order pairs"
			]
		],
		description: "Sorts an array by the values in one or more external arrays rather than by its own columns. Use it to sort one list based on the order defined in a separate related list.",
		examples: ["=SORTBY(A2:A10, B2:B10) sorts the names in A2:A10 by the scores in B2:B10."]
	},
	sqrt: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Non-negative value whose square root you want"
		]],
		description: "Returns the positive square root of a number. Use it whenever square roots appear in formulas - distance calculations, statistical formulas, geometry.",
		examples: ["=SQRT(16) returns 4."]
	},
	sqrtpi: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Non-negative multiplier of π inside the square root"
		]],
		description: "Returns the square root of (number × π). Useful in probability and statistics - particularly for formulas derived from the normal distribution.",
		examples: ["=SQRTPI(1) returns √π ≈ 1.772."]
	},
	standardize: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value to normalize"
			],
			[
				"mean",
				"number",
				"Mean of the distribution"
			],
			[
				"standard_dev",
				"number",
				"Standard deviation (must be positive)"
			]
		],
		description: "Returns the standardized (z-score) equivalent of a value: (x − mean) / standard_deviation. Use it to convert raw values to standard deviations from the mean for comparison across different scales or distributions.",
		examples: ["=STANDARDIZE(A2, AVERAGE(A$2:A$100), STDEV(A$2:A$100)) returns the z-score."]
	},
	stdev: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range (treated as a sample)"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Estimates standard deviation based on a sample, ignoring text and logical values. Equivalent to STDEV.S.",
		examples: ["=STDEV(A2:A20) returns the sample standard deviation of the range."]
	},
	"stdev.p": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range (treats data as the whole population)"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the population standard deviation (divides by n). Use it when your values represent the entire population and you want the exact spread of that population.",
		examples: ["=STDEV.P(A2:A100)."]
	},
	"stdev.s": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range (treats data as a sample)"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the sample standard deviation (divides by n−1). The most common standard deviation function - use it when your data is a sample from a larger population and you want an unbiased estimate of the population spread.",
		examples: ["=STDEV.S(A2:A20)."]
	},
	stdeva: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"any",
			"First value or range; text and FALSE count as 0, TRUE as 1"
		], [
			"...",
			"any",
			"Additional values or ranges"
		]],
		description: "Like STDEV.S but includes text (as 0) and logical values in the calculation. Use it when your range has mixed types and non-numeric entries should contribute to the spread.",
		examples: ["=STDEVA(A2:A20)."]
	},
	stdevp: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range (treated as the whole population)"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Compatibility name for STDEV.P. Prefer STDEV.P in new formulas.",
		examples: ["=STDEVP(A2:A20) is equivalent to =STDEV.P(A2:A20)."]
	},
	stdevpa: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"any",
			"First value or range; text and FALSE count as 0, TRUE as 1 (whole population)"
		], [
			"...",
			"any",
			"Additional values or ranges"
		]],
		description: "Like STDEV.P but includes text and logical values. Use it for population standard deviation over a mixed-type range.",
		examples: ["=STDEVPA(A2:A100)."]
	},
	steyx: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"known_ys",
			"number_or_range",
			"Dependent (y) data points"
		], [
			"known_xs",
			"number_or_range",
			"Independent (x) data points, same count as known_ys"
		]],
		description: "Returns the standard error of the predicted y values in a linear regression - a measure of how accurate the regression line's predictions are on average. Use it to gauge the precision of your linear model.",
		examples: ["=STEYX(B2:B20, A2:A20) returns the standard error of the estimate."]
	},
	substitute: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"Original string"
			],
			[
				"old_text",
				"text",
				"Substring to find and replace (case-sensitive)"
			],
			[
				"new_text*",
				"text",
				"Replacement string"
			],
			[
				"instance_num*",
				"integer",
				"Which occurrence to replace; replaces all occurrences if omitted"
			]
		],
		description: "Replaces all occurrences (or a specific occurrence) of a substring within a text string. Use it for formula-driven find-and-replace when you don't know the position - replacing spaces with underscores, removing unwanted characters, or swapping out a code value.",
		examples: ["=SUBSTITUTE(A2, \" \", \"_\") replaces all spaces with underscores."]
	},
	subtotal: {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"function_num",
				"integer",
				"Function code: 1-11 include manually hidden rows; 101-111 exclude them (e.g. 9 or 109 = SUM, 1 or 101 = AVERAGE)"
			],
			[
				"ref1",
				"range",
				"First range to include"
			],
			[
				"...",
				"range",
				"Additional ranges"
			]
		],
		description: "Returns a subtotal of a list using any of 11 aggregation functions (SUM, AVERAGE, COUNT, etc.), and can ignore hidden rows. Use it in filtered tables so that your aggregate updates to reflect only the visible data - unlike SUM, which always includes hidden rows.",
		examples: ["=SUBTOTAL(9, A2:A100) sums only visible rows."]
	},
	sum: {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"number1",
				"number_or_range",
				"First value or range to add"
			],
			[
				"number2*",
				"number_or_range",
				"Second value or range"
			],
			[
				"...",
				"number_or_range",
				"Additional values or ranges"
			]
		],
		description: "Adds all numbers in a range together and returns the total. The most-used function in Excel - use it to total a column of sales, sum expenses, or add up any list of numbers.",
		examples: ["=SUM(A2:A100) returns the total of the entire range."]
	},
	sumif: {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"range",
				"range",
				"Cells to evaluate against the condition"
			],
			[
				"criteria",
				"any",
				"Condition to match, e.g. \">100\" or \"East\""
			],
			[
				"sum_range*",
				"range",
				"Cells to sum; defaults to range if omitted"
			]
		],
		description: "Adds values in a range that meet a single condition. Use it to total a specific category - for instance, summing sales for the \"West\" region only, or summing amounts above a threshold.",
		examples: ["=SUMIF(B2:B100, \"West\", C2:C100) sums C where B is \"West\"."]
	},
	sumifs: {
		tier: 0,
		category: 8,
		tags: [],
		args: [
			[
				"sum_range",
				"range",
				"Cells to sum"
			],
			[
				"range1",
				"range",
				"First criteria range"
			],
			[
				"criteria1*",
				"any",
				"Condition for range1"
			],
			[
				"range2*",
				"range",
				"Second criteria range"
			],
			[
				"criteria2*",
				"any",
				"Condition for range2"
			]
		],
		description: "Adds values in a range that meet multiple conditions simultaneously. Use it like SUMIF but with several filters at once - for example, sales in the West region for a specific product and month.",
		examples: ["=SUMIFS(C2:C100, B2:B100, \"West\", D2:D100, \"Widgets\") sums C where both conditions are met."]
	},
	sumproduct: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"array1",
			"array",
			"First array"
		], [
			"...",
			"array",
			"Additional arrays to multiply element-wise before summing; all must be the same size"
		]],
		description: "Multiplies corresponding elements in two or more arrays, then sums all the products. Use it for weighted averages, multi-criteria conditional sums without SUMIFS, or any calculation that involves pairing and aggregating two lists.",
		examples: ["=SUMPRODUCT((C2:C10=\"West\")*(D2:D10)) sums D where C is \"West\"."]
	},
	sumsq: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the sum of the squares of its arguments. Use it in statistics and engineering - for instance, when computing the sum of squared errors or the squared magnitude of a vector.",
		examples: ["=SUMSQ(3, 4) returns 25 (9 + 16)."]
	},
	sumx2my2: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"array_x",
			"number_or_range",
			"X values"
		], [
			"array_y",
			"number_or_range",
			"Y values, same count as array_x"
		]],
		description: "Returns the sum of differences of squares of corresponding values in two arrays: Σ(x²−y²). Used in specialized mathematical and physics calculations.",
		examples: ["=SUMX2MY2(A2:A5, B2:B5) computes Σ(A²−B²)."]
	},
	sumx2py2: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"array_x",
			"number_or_range",
			"X values"
		], [
			"array_y",
			"number_or_range",
			"Y values, same count as array_x"
		]],
		description: "Returns the sum of sums of squares of corresponding values in two arrays: Σ(x²+y²). Useful for computing the sum of squared magnitudes of paired values.",
		examples: ["=SUMX2PY2(A2:A5, B2:B5) computes Σ(A²+B²)."]
	},
	sumxmy2: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"array_x",
			"number_or_range",
			"X values"
		], [
			"array_y",
			"number_or_range",
			"Y values, same count as array_x"
		]],
		description: "Returns the sum of squared differences of corresponding values in two arrays: Σ(x−y)². Use it to compute the total squared error between two sets of values - for example, between predictions and actuals.",
		examples: ["=SUMXMY2(predicted, actual) returns Σ(pred−actual)²."]
	},
	switch: {
		tier: 0,
		category: 6,
		tags: [],
		args: [
			[
				"expression",
				"any",
				"Value to compare against each case"
			],
			[
				"val1/result1*",
				"any",
				"First value to match and its result (passed as consecutive arguments)"
			],
			[
				"val2/result2*",
				"any",
				"Second value/result pair"
			],
			[
				"...",
				"any",
				"Additional pairs; if the last argument has no matching value, it is treated as the default"
			]
		],
		description: "Compares an expression against a list of values and returns the result paired with the first match. Use it instead of nested IFs when you are matching a single value against several exact cases - like translating a status code into a readable label.",
		examples: ["=SWITCH(A2, 1, \"Low\", 2, \"Medium\", 3, \"High\", \"Unknown\")."]
	},
	syd: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"cost",
				"number",
				"Initial cost of the asset"
			],
			[
				"salvage",
				"number",
				"Residual value at end of useful life"
			],
			[
				"life",
				"integer",
				"Number of periods in the asset's useful life"
			],
			[
				"period",
				"integer",
				"Period to calculate depreciation for"
			]
		],
		description: "Returns the sum-of-years'-digits depreciation for a specific period - a method that allocates more depreciation to early years and less to later ones. Use it when accelerated depreciation is required but double-declining balance is too aggressive.",
		examples: ["=SYD(cost, salvage, life, period)."]
	},
	t: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression to test; returns the text if it is a string, otherwise an empty string"
		]],
		description: "Returns the text value in a cell, or an empty string if the cell doesn't contain text. Use it as a type gate to pass only text values through a formula while silently converting numbers and other types to an empty string.",
		examples: ["=T(A2) returns A2's text if it is text, otherwise \"\"."]
	},
	"t.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Point at which to evaluate the distribution"
			],
			[
				"deg_freedom",
				"integer",
				"Number of degrees of freedom; at least 1"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution function; FALSE for the probability density function"
			]
		],
		description: "Returns the Student's t-distribution probability (left-tailed CDF or PDF). Use it in hypothesis testing for small samples when the population standard deviation is unknown.",
		examples: ["=T.DIST(2.0, 10, TRUE) returns the left-tail probability with 10 degrees of freedom."]
	},
	"t.dist.2t": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"x",
			"number",
			"Point at which to evaluate the distribution; must be non-negative"
		], [
			"deg_freedom",
			"integer",
			"Number of degrees of freedom; at least 1"
		]],
		description: "Returns the two-tailed t-distribution probability for a given t-statistic. Use it for two-tailed t-tests - when you're testing whether a difference is non-zero in either direction.",
		examples: ["=T.DIST.2T(2.0, 10) returns the two-tailed p-value."]
	},
	"t.dist.rt": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"x",
			"number",
			"Point at which to evaluate the distribution"
		], [
			"deg_freedom",
			"integer",
			"Number of degrees of freedom; at least 1"
		]],
		description: "Returns the right-tailed t-distribution probability. Use it for one-tailed t-tests where you're testing whether a value is greater than a null hypothesis value.",
		examples: ["=T.DIST.RT(2.0, 10) returns the right-tail p-value."]
	},
	"t.inv": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"probability",
			"number",
			"Left-tail probability between 0 and 1 for the t-distribution"
		], [
			"deg_freedom",
			"integer",
			"Number of degrees of freedom; at least 1"
		]],
		description: "Returns the inverse of the left-tailed t-distribution - the t-value at a given probability. Use it to find critical values for one-tailed tests or to construct confidence intervals.",
		examples: ["=T.INV(0.95, 10) returns the one-tailed 95th-percentile t-value."]
	},
	"t.inv.2t": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"probability",
			"number",
			"Two-tailed probability between 0 and 1 for the t-distribution"
		], [
			"deg_freedom",
			"integer",
			"Number of degrees of freedom; at least 1"
		]],
		description: "Returns the inverse of the two-tailed t-distribution. Use it to find the critical t-value for a two-tailed hypothesis test at a given significance level.",
		examples: ["=T.INV.2T(0.05, 10) returns the critical value for a 5% two-tailed test with 10 degrees of freedom."]
	},
	"t.test": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"array1",
				"range",
				"The first data set"
			],
			[
				"array2",
				"range",
				"The second data set"
			],
			[
				"tails",
				"integer",
				"Number of distribution tails: 1 for one-tailed, 2 for two-tailed"
			],
			[
				"type",
				"integer",
				"Test kind: 1 paired, 2 two-sample equal variance, 3 two-sample unequal variance"
			]
		],
		description: "Returns the p-value for a Student's t-test comparing two datasets. Use it to determine whether the difference in means between two groups is statistically significant.",
		examples: ["=T.TEST(A2:A20, B2:B20, 2, 2) performs a two-tailed, two-sample t-test."]
	},
	take: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Source array"
			],
			[
				"rows",
				"integer",
				"Rows to take from the top; negative takes from the bottom"
			],
			[
				"...",
				"integer",
				"Columns to take from the left; negative takes from the right"
			]
		],
		description: "Returns a specified number of rows or columns from the start or end of an array. Use it to grab the top N or bottom N rows from a dataset - for instance, to show the five most recent entries.",
		examples: ["=TAKE(A2:D100, 5) returns the first 5 rows; =TAKE(A2:D100, -5) returns the last 5."]
	},
	tan: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Angle in radians"
		]],
		description: "Returns the tangent of an angle given in radians. Use it in geometry and physics for slope calculations, angle problems, and wave analysis.",
		examples: ["=TAN(PI()/4) returns 1 (tangent of 45°)."]
	},
	tanh: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Any real number"
		]],
		description: "Returns the hyperbolic tangent of a number, always between −1 and 1. Used in engineering, statistics, and as a smooth sigmoid-like function in mathematical models.",
		examples: ["=TANH(1) returns approximately 0.762."]
	},
	tbilleq: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the T-bill"
			],
			[
				"maturity",
				"date",
				"Maturity date of the T-bill"
			],
			[
				"discount",
				"number",
				"Discount rate as a decimal"
			]
		],
		description: "Returns the bond-equivalent yield of a Treasury bill. Use it to compare a T-bill's return to coupon-bearing bonds on a consistent annual-yield basis.",
		examples: ["=TBILLEQ(settlement, maturity, discount) returns the equivalent annual yield."]
	},
	tbillprice: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the T-bill"
			],
			[
				"maturity",
				"date",
				"Maturity date of the T-bill"
			],
			[
				"discount",
				"number",
				"Discount rate as a decimal"
			]
		],
		description: "Returns the price per $100 face value of a Treasury bill. Use it to calculate what you pay today for a T-bill given its discount rate and dates.",
		examples: ["=TBILLPRICE(settlement, maturity, discount)."]
	},
	tbillyield: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the T-bill"
			],
			[
				"maturity",
				"date",
				"Maturity date of the T-bill"
			],
			[
				"price",
				"number",
				"Price per $100 face value"
			]
		],
		description: "Returns the yield of a Treasury bill given its price and dates. Use it to find the return on a T-bill you already hold or are evaluating.",
		examples: ["=TBILLYIELD(settlement, maturity, pr)."]
	},
	tdist: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value to evaluate (non-negative)"
			],
			[
				"degrees_freedom",
				"integer",
				"Degrees of freedom"
			],
			[
				"tails",
				"integer",
				"1 for one-tailed; 2 for two-tailed"
			]
		],
		description: "Compatibility name for T.DIST.RT or T.DIST.2T. Prefer T.DIST.RT or T.DIST.2T in new formulas.",
		examples: ["=TDIST(2.5, 10, 2) is equivalent to =T.DIST.2T(2.5, 10)."]
	},
	text: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"value",
			"any",
			"Numeric value or date to format"
		], [
			"format_text",
			"text",
			"Excel format code that controls the output, e.g. \"0.00\" or \"MMM YYYY\""
		]],
		description: "Formats a number as text using a custom number-format code. Use it to embed a formatted number inside a text string - for example, to display a date or currency amount with the formatting intact when concatenating with other text.",
		examples: ["=\"Revenue: \"&TEXT(A2, \"$#,##0.00\") produces \"Revenue: $1,234.56\"."]
	},
	textafter: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"String to search in"
			],
			[
				"delimiter",
				"text",
				"Marker to search for"
			],
			[
				"instance_num*",
				"integer",
				"Which occurrence to use; negative counts from the end"
			],
			[
				"match_mode*",
				"integer",
				"0=case-sensitive (default), 1=case-insensitive"
			],
			[
				"match_end*",
				"logical",
				"TRUE treats the end of the string as an implicit delimiter"
			],
			[
				"if_not_found*",
				"any",
				"Value to return when the delimiter is not found"
			]
		],
		description: "Returns the text that occurs after a specified delimiter, with options to select which occurrence and how to handle a missing match. Use it to split text without knowing the character position - extracting the domain from an email address, for instance.",
		examples: ["=TEXTAFTER(A2, \"@\") returns everything after the first \"@\"."]
	},
	textbefore: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"String to search in"
			],
			[
				"delimiter",
				"text",
				"Marker to search for"
			],
			[
				"instance_num*",
				"integer",
				"Which occurrence to use; negative counts from the end"
			],
			[
				"match_mode*",
				"integer",
				"0=case-sensitive (default), 1=case-insensitive"
			],
			[
				"match_end*",
				"logical",
				"TRUE treats the start of the string as an implicit delimiter"
			],
			[
				"if_not_found*",
				"any",
				"Value to return when the delimiter is not found"
			]
		],
		description: "Returns the text that occurs before a specified delimiter. The counterpart of TEXTAFTER - use it to extract the portion of a string that comes before a known separator.",
		examples: ["=TEXTBEFORE(A2, \"@\") returns the username portion of an email address."]
	},
	textjoin: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"delimiter",
				"text",
				"Separator to place between each joined value"
			],
			[
				"ignore_empty*",
				"logical",
				"TRUE to skip empty cells; FALSE to include them as empty strings"
			],
			[
				"text1*",
				"any",
				"First value or range to join"
			],
			[
				"...",
				"any",
				"Additional values or ranges"
			]
		],
		description: "Joins a range of text values with a specified delimiter, optionally skipping blank cells. Use it to build a comma-separated list, a readable sentence, or any delimited string from a column or row of values.",
		examples: ["=TEXTJOIN(\", \", TRUE, A2:A10) produces \"Alice, Bob, Carol\" (skipping any blanks)."]
	},
	textsplit: {
		tier: 0,
		category: 10,
		tags: [],
		args: [
			[
				"text",
				"text",
				"String to split"
			],
			[
				"col_delimiter",
				"text",
				"Character (or array of characters) that separates columns"
			],
			[
				"row_delimiter*",
				"text",
				"Character that separates rows; omit for a single-row result"
			],
			[
				"ignore_empty*",
				"logical",
				"TRUE to treat consecutive delimiters as one"
			],
			[
				"match_mode*",
				"integer",
				"0=case-sensitive (default), 1=case-insensitive"
			],
			[
				"...",
				"any",
				"Pad value used to fill in shorter rows; defaults to #N/A"
			]
		],
		description: "Splits a text string into a two-dimensional array using row and/or column delimiters. Use it to parse delimited data - splitting a CSV line into separate columns or a multi-line block into rows - in a single formula that spills automatically.",
		examples: ["=TEXTSPLIT(A2, \",\") splits comma-separated values into individual cells."]
	},
	time: {
		tier: 0,
		category: 2,
		tags: [],
		args: [
			[
				"hour",
				"integer",
				"Hour component (0-23)"
			],
			[
				"minute",
				"integer",
				"Minute component (0-59)"
			],
			[
				"second",
				"integer",
				"Second component (0-59)"
			]
		],
		description: "Creates a time value from separate hour, minute, and second numbers. Use it to assemble a time from components or to add a precise time increment to a date.",
		examples: ["=TIME(14, 30, 0) returns 2:30 PM."]
	},
	timevalue: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"time_text",
			"text",
			"Time expressed as a recognisable text string, e.g. \"2:30 PM\""
		]],
		description: "Converts a time stored as text (such as \"2:30 PM\") into a decimal fraction that Excel can calculate with. Use it when time values arrived as text strings after an import.",
		examples: ["=TIMEVALUE(\"14:30:00\") returns 0.6042, the fraction of a 24-hour day."]
	},
	tinv: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"probability",
			"number",
			"Two-tailed probability between 0 and 1"
		], [
			"degrees_freedom",
			"integer",
			"Degrees of freedom"
		]],
		description: "Compatibility name for T.INV.2T. Prefer T.INV.2T in new formulas.",
		examples: ["=TINV(0.05, 10) is equivalent to =T.INV.2T(0.05, 10)."]
	},
	tocol: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Array or range to collapse into a single column"
			],
			[
				"ignore*",
				"integer",
				"0=keep everything (default), 1=ignore blanks, 2=ignore errors, 3=ignore both"
			],
			[
				"...",
				"logical",
				"TRUE scans by row (left to right, top to bottom); FALSE scans by column (default)"
			]
		],
		description: "Converts an array or range into a single column, optionally ignoring blanks or errors. Use it to flatten a two-dimensional table into a vertical list for further processing or deduplication.",
		examples: ["=TOCOL(A1:D5) stacks all 20 values into one column."]
	},
	today: {
		tier: 0,
		category: 2,
		tags: [],
		args: [],
		description: "Returns today's date (with no time component) and updates on every recalculation. Use it for age calculations, days-until-deadline formulas, or any formula that should always reflect the current date.",
		examples: ["=TODAY()-A2 gives the number of days since the date in A2."]
	},
	torow: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Array or range to collapse into a single row"
			],
			[
				"ignore*",
				"integer",
				"0=keep everything (default), 1=ignore blanks, 2=ignore errors, 3=ignore both"
			],
			[
				"...",
				"logical",
				"TRUE scans by column; FALSE scans by row (default)"
			]
		],
		description: "Converts an array or range into a single row, optionally ignoring blanks or errors. Use it to flatten a table into a horizontal list.",
		examples: ["=TOROW(A1:D5) returns all 20 values in a single row."]
	},
	transpose: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"array",
			"array",
			"Array or range to flip so rows become columns and vice versa"
		]],
		description: "Rotates an array so that rows become columns and columns become rows. Use it to reorient data - for example, converting a vertical list of months into a horizontal header row, or vice versa.",
		examples: ["=TRANSPOSE(A1:A12) returns a 12-column, 1-row array."]
	},
	trend: {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"known_ys",
				"number_or_range",
				"Known dependent values"
			],
			[
				"known_xs*",
				"number_or_range",
				"Known independent values; defaults to 1, 2, 3..."
			],
			[
				"new_xs*",
				"number_or_range",
				"New x values for which to predict y"
			],
			[
				"const*",
				"logical",
				"TRUE (default) fits the intercept; FALSE forces it to zero"
			]
		],
		description: "Returns predicted y-values along a linear trend fitted to existing data. The linear counterpart to GROWTH.",
		examples: ["=TREND(B2:B6, A2:A6, A7:A10) predicts future values along the fitted line."]
	},
	trim: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String to remove leading, trailing, and extra interior spaces from"
		]],
		description: "Removes leading and trailing spaces from a text string and collapses internal multiple spaces to single spaces. Use it to clean up data entered or imported with extra whitespace, which prevents correct matching, sorting, and lookups.",
		examples: ["=TRIM(A2) normalizes spacing in the text."]
	},
	trimmean: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"array",
			"number_or_range",
			"Data values"
		], [
			"percent",
			"number",
			"Fraction of data points to exclude from each end (e.g. 0.1 trims 5% from each end)"
		]],
		description: "Returns the mean of the interior of a dataset after excluding a specified proportion of the most extreme values from both ends.",
		examples: ["=TRIMMEAN(A2:A20, 0.2) averages after dropping the top and bottom 10%."]
	},
	trimrange: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"range",
				"range",
				"Range to trim"
			],
			[
				"trim_rows*",
				"logical",
				"TRUE removes blank rows at the top and bottom edges"
			],
			[
				"...",
				"logical",
				"TRUE removes blank columns at the left and right edges"
			]
		],
		description: "Trims rows and/or columns of empty cells from the edges of an array. Use it to remove trailing blanks from a dynamic spill result before passing it to another function that would be thrown off by extra empty rows.",
		examples: ["=TRIMRANGE(A1:D20) removes any all-blank rows or columns at the edges."]
	},
	true: {
		tier: 0,
		category: 6,
		tags: [],
		args: [],
		description: "Returns the logical value TRUE. Use it in formulas that require a literal TRUE as a function argument - for instance, when specifying cumulative probability in a distribution function.",
		examples: ["=NORM.DIST(75, 70, 10, TRUE) returns the cumulative probability."]
	},
	trunc: {
		tier: 0,
		category: 8,
		tags: [],
		args: [[
			"number",
			"number",
			"Value to truncate toward zero"
		], [
			"num_digits*",
			"integer",
			"Decimal places to keep; defaults to 0 (integer result)"
		]],
		description: "Removes the fractional part of a number, always rounding toward zero regardless of sign. Use it when you want to drop decimals without rounding - unlike INT, =TRUNC(-4.9) returns -4, not -5.",
		examples: ["=TRUNC(4.9) returns 4; =TRUNC(-4.9) returns -4."]
	},
	ttest: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"array1",
				"number_or_range",
				"First dataset"
			],
			[
				"array2",
				"number_or_range",
				"Second dataset"
			],
			[
				"tails",
				"integer",
				"1 for one-tailed; 2 for two-tailed"
			],
			[
				"type",
				"integer",
				"1=paired, 2=two-sample equal variance, 3=two-sample unequal variance"
			]
		],
		description: "Compatibility name for T.TEST. Prefer T.TEST in new formulas.",
		examples: ["=TTEST(A2:A10, B2:B10, 2, 1) is equivalent to =T.TEST(A2:A10, B2:B10, 2, 1)."]
	},
	type: {
		tier: 0,
		category: 5,
		tags: [],
		args: [[
			"value",
			"any",
			"Expression whose type code to return: 1=number, 2=text, 4=logical, 8=formula, 16=error, 64=array"
		]],
		description: "Returns a number indicating the data type of a value: 1 for number, 2 for text, 4 for logical, 16 for error, 64 for array. Use it to write type-safe formulas or to diagnose unexpected data types in a cell.",
		examples: ["=TYPE(\"hello\") returns 2; =TYPE(3.14) returns 1."]
	},
	unichar: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"number",
			"integer",
			"Unicode code point to convert to its character"
		]],
		description: "Returns the Unicode character corresponding to a given code point. Use it to insert any Unicode character - symbols, accented letters, emojis - by their code number when you can't type them directly.",
		examples: ["=UNICHAR(9829) returns \"♥\"."]
	},
	unicode: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String whose first character's Unicode code point you want"
		]],
		description: "Returns the Unicode code point of the first character in a text string. Use it alongside UNICHAR to inspect or transform individual Unicode characters.",
		examples: ["=UNICODE(\"A\") returns 65; =UNICODE(\"♥\") returns 9829."]
	},
	unique: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"array",
				"array",
				"Array or range to deduplicate"
			],
			[
				"by_col*",
				"logical",
				"TRUE to return unique columns; FALSE for unique rows (default)"
			],
			[
				"...",
				"logical",
				"TRUE to return only values that appear exactly once; FALSE returns all distinct values (default)"
			]
		],
		description: "Returns the distinct values from a list or table, removing duplicates. Use it to build a unique list of items - categories, customers, regions - that updates automatically as new data is added.",
		examples: ["=UNIQUE(A2:A100) spills the distinct values found in column A."]
	},
	upper: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"String to convert to uppercase"
		]],
		description: "Converts all letters in a text string to uppercase. Use it to normalize text for display or comparison - ensuring all ticker symbols, country codes, or identifiers are consistently uppercase.",
		examples: ["=UPPER(\"hello world\") returns \"HELLO WORLD\"."]
	},
	value: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"text",
			"text",
			"Number, date, or time stored as a text string"
		]],
		description: "Converts a text string that looks like a number into an actual numeric value. Use it when numbers are stored as text - a common problem after imports - causing arithmetic to fail or sort incorrectly.",
		examples: ["=VALUE(\"1,234.56\") returns 1234.56."]
	},
	valuetotext: {
		tier: 0,
		category: 10,
		tags: [],
		args: [[
			"value",
			"any",
			"Value to convert to a text representation"
		], [
			"format*",
			"integer",
			"0=concise format (default), 1=strict format with quotes and delimiters"
		]],
		description: "Converts any value - including arrays, errors, and logical values - to its text representation in a concise or strict format. Use it to display or inspect a value as a string, especially for debugging or generating readable output from dynamic arrays.",
		examples: ["=VALUETOTEXT(TRUE, 0) returns \"TRUE\"."]
	},
	var: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range (treated as a sample)"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Compatibility name for VAR.S. Prefer VAR.S in new formulas.",
		examples: ["=VAR(A2:A20) is equivalent to =VAR.S(A2:A20)."]
	},
	"var.p": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range (treats data as the whole population)"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the population variance (divides by n). Use it when your values are the entire population and you want the average squared deviation from the mean.",
		examples: ["=VAR.P(A2:A100)."]
	},
	"var.s": {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range (treats data as a sample)"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Returns the sample variance (divides by n−1). The most common variance function - use it when your data is a sample from a larger population.",
		examples: ["=VAR.S(A2:A20)."]
	},
	vara: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"any",
			"First value or range; text and FALSE count as 0, TRUE as 1 (sample variance)"
		], [
			"...",
			"any",
			"Additional values or ranges"
		]],
		description: "Like VAR.S but includes text (as 0) and logical values. Use it when your range has mixed types and non-numeric entries should be counted.",
		examples: ["=VARA(A2:A20)."]
	},
	varp: {
		tier: 0,
		category: 11,
		tags: [],
		args: [[
			"number1",
			"number_or_range",
			"First value or range (treated as the whole population)"
		], [
			"...",
			"number_or_range",
			"Additional values or ranges"
		]],
		description: "Compatibility name for VAR.P. Prefer VAR.P in new formulas.",
		examples: ["=VARP(A2:A20) is equivalent to =VAR.P(A2:A20)."]
	},
	varpa: {
		tier: 0,
		category: 9,
		tags: [],
		args: [[
			"number1",
			"any",
			"First value or range; text and FALSE count as 0, TRUE as 1 (population variance)"
		], [
			"...",
			"any",
			"Additional values or ranges"
		]],
		description: "Like VAR.P but includes text and logical values. Use it for population variance over a mixed-type range.",
		examples: ["=VARPA(A2:A100)."]
	},
	vdb: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"cost",
				"number",
				"Initial cost of the asset"
			],
			[
				"salvage",
				"number",
				"Residual value at end of useful life"
			],
			[
				"life",
				"number",
				"Number of periods in the asset's useful life"
			],
			[
				"start_period",
				"number",
				"First period to depreciate, in units of life"
			],
			[
				"end_period",
				"number",
				"Last period to depreciate, in units of life"
			],
			[
				"factor*",
				"number",
				"Depreciation rate multiplier; defaults to 2 for double-declining balance"
			],
			[
				"no_switch*",
				"logical",
				"TRUE keeps declining balance throughout; FALSE (default) switches to straight line once that gives more"
			]
		],
		description: "Returns the depreciation of an asset over a span of periods using the variable declining balance method. Unlike DDB it covers a range rather than a single period, accepts partial periods, and by default switches to straight line once that writes off more.",
		examples: ["=VDB(10000, 1000, 10, 0, 0.5) returns the depreciation for the first half of year one."]
	},
	vlookup: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"lookup_value",
				"any",
				"Value to search for in the first column of the table"
			],
			[
				"table_array",
				"range",
				"Table to search"
			],
			[
				"column_index_num",
				"integer",
				"1-based column number within the table to return a value from"
			],
			[
				"range_lookup",
				"logical",
				"TRUE for approximate match (first column must be sorted ascending); FALSE for exact match"
			]
		],
		description: "Searches for a value in the first column of a table and returns a value from another column in the same row. The classic lookup function - use it to join tables on a key, like finding a price for a product code. Note: XLOOKUP is more flexible for complex lookups.",
		examples: ["=VLOOKUP(A2, PriceTable, 3, FALSE) returns the value from column 3 of PriceTable where column 1 matches A2."]
	},
	vstack: {
		tier: 0,
		category: 7,
		tags: [],
		args: [[
			"array1",
			"array",
			"First array"
		], [
			"...",
			"array",
			"Additional arrays to stack below, matched by column count"
		]],
		description: "Combines multiple arrays or ranges one on top of the other (vertically) into a single array. Use it to concatenate tables that share the same column structure.",
		examples: ["=VSTACK(A1:C10, A12:C20) stacks two tables into one continuous block."]
	},
	weekday: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"serial_number",
			"date",
			"Date value whose day-of-week number you want"
		], [
			"return_type*",
			"integer",
			"Controls which day is 1: 1=Sun-Sat, 2=Mon-Sun, 3=Mon-Sun starting from 0, and others"
		]],
		description: "Returns a number representing the day of the week for a given date, using a return_type you specify (e.g., 1 = Sunday through 7 = Saturday). Use it to highlight weekends, filter to specific days, or build conditional formatting rules.",
		examples: ["=WEEKDAY(A2, 2) returns 1 for Monday and 7 for Sunday."]
	},
	weeknum: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"serial_num",
			"date",
			"Date whose week number you want"
		], [
			"return_type*",
			"integer",
			"Day the week starts on: 1=Sunday (default), 2=Monday, 21=ISO Monday"
		]],
		description: "Returns the week number of the year (1–53) for a given date. Use it to group data by week or to calculate how many weeks into the year a date falls.",
		examples: ["=WEEKNUM(A2) returns the calendar week number for the date in A2."]
	},
	weibull: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Value to evaluate"
			],
			[
				"alpha",
				"number",
				"Shape parameter"
			],
			[
				"beta",
				"number",
				"Scale parameter"
			],
			[
				"cumulative",
				"logical",
				"TRUE for cumulative distribution; FALSE for probability density"
			]
		],
		description: "Compatibility name for WEIBULL.DIST. Prefer WEIBULL.DIST in new formulas.",
		examples: ["=WEIBULL(105, 20, 100, TRUE) is equivalent to =WEIBULL.DIST(105, 20, 100, TRUE)."]
	},
	"weibull.dist": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"x",
				"number",
				"Non-negative value to evaluate"
			],
			[
				"alpha",
				"number",
				"Shape parameter (must be positive)"
			],
			[
				"beta",
				"number",
				"Scale parameter (must be positive)"
			],
			[
				"cumulative",
				"logical",
				"TRUE for the cumulative distribution; FALSE for the probability density"
			]
		],
		description: "Returns the Weibull distribution probability (CDF or PDF). Use it to model time-to-failure or reliability data - the Weibull distribution is widely used in engineering for survival and failure analysis.",
		examples: ["=WEIBULL.DIST(100, 1.5, 200, TRUE) returns the probability that a component fails by time 100."]
	},
	workday: {
		tier: 0,
		category: 2,
		tags: [],
		args: [
			[
				"start_date",
				"date",
				"Starting date"
			],
			[
				"days",
				"integer",
				"Working days to advance; negative moves backward"
			],
			[
				"holidays*",
				"range",
				"Optional list of additional non-working dates to skip"
			]
		],
		description: "Returns the date that is a specified number of working days before or after a start date, optionally skipping holidays. Use it to calculate delivery deadlines, response-time commitments, or any milestone defined in business days.",
		examples: ["=WORKDAY(A2, 10, Holidays) returns the date 10 business days after A2."]
	},
	"workday.intl": {
		tier: 0,
		category: 2,
		tags: [],
		args: [
			[
				"start_date",
				"date",
				"Starting date"
			],
			[
				"days",
				"integer",
				"Working days to advance; negative moves backward"
			],
			[
				"weekend*",
				"any",
				"Weekend number code or 7-character day mask; defaults to Saturday and Sunday"
			],
			[
				"holidays*",
				"range",
				"Optional list of additional non-working dates to skip"
			]
		],
		description: "Like WORKDAY, but lets you define a custom weekend using a mask or preset code. Use it when your organization operates on a non-standard weekly schedule - for instance, a Friday–Saturday weekend.",
		examples: ["=WORKDAY.INTL(A2, 10, 7, Holidays) treats Friday and Saturday as the weekend."]
	},
	wrapcols: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"vector",
				"range",
				"Single-row or single-column source data"
			],
			[
				"wrap_count",
				"integer",
				"Maximum number of items per column"
			],
			[
				"...",
				"any",
				"Value to pad incomplete columns with; defaults to #N/A"
			]
		],
		description: "Wraps a one-dimensional array into a multi-column layout of a specified row height. Use it to reflow a vertical list into a grid - for instance, turning 12 month names into a 3×4 block.",
		examples: ["=WRAPCOLS(A1:A12, 4) creates three columns of four items each."]
	},
	wraprows: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"vector",
				"range",
				"Single-row or single-column source data"
			],
			[
				"wrap_count",
				"integer",
				"Maximum number of items per row"
			],
			[
				"...",
				"any",
				"Value to pad incomplete rows with; defaults to #N/A"
			]
		],
		description: "Wraps a one-dimensional array into a multi-row layout of a specified width. The horizontal counterpart to WRAPCOLS - use it to arrange a list into rows of fixed length.",
		examples: ["=WRAPROWS(A1:A12, 4) creates three rows of four items each."]
	},
	xirr: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"values",
				"range",
				"Cash flow amounts; must include at least one negative and one positive value"
			],
			[
				"dates",
				"range",
				"Corresponding dates for each cash flow, in any order"
			],
			[
				"guess*",
				"number",
				"Initial rate estimate; defaults to 0.1"
			]
		],
		description: "Calculates the Internal Rate of Return for a series of cash flows occurring on irregular (non-periodic) dates. Use it for real-world investment analysis where cash flows don't land on regular intervals.",
		examples: ["=XIRR(values, dates) returns the annualized IRR."]
	},
	xlookup: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"lookup",
				"any",
				"Value to search for"
			],
			[
				"lookup_array",
				"range",
				"Single-row or single-column range to search"
			],
			[
				"return_array",
				"range",
				"Range of the same size to return a value from"
			],
			[
				"if_not_found*",
				"any",
				"Value to return when no match is found; omitting returns #N/A"
			],
			[
				"match_mode*",
				"integer",
				"0=exact (default), -1=exact or next smaller, 1=exact or next larger, 2=wildcard"
			],
			[
				"...",
				"integer",
				"Search mode: 1=first to last (default), -1=last to first, 2=binary ascending, -2=binary descending"
			]
		],
		description: "Searches for a value in a lookup array and returns the corresponding value from a result array, with options for match mode and search direction. Use it as the modern replacement for VLOOKUP and HLOOKUP - it can search in any direction, return multiple columns, and handle missing values gracefully.",
		examples: ["=XLOOKUP(A2, B2:B100, C2:D100, \"Not found\") returns two columns of results where B matches A2."]
	},
	xmatch: {
		tier: 0,
		category: 7,
		tags: [],
		args: [
			[
				"lookup_value",
				"any",
				"Value to find"
			],
			[
				"lookup_array",
				"range",
				"Single-row or single-column range to search"
			],
			[
				"match_mode*",
				"integer",
				"0=exact (default), -1=exact or next smaller, 1=exact or next larger, 2=wildcard"
			],
			[
				"...",
				"integer",
				"Search mode: 1=first to last (default), -1=last to first, 2=binary ascending, -2=binary descending"
			]
		],
		description: "Searches for a value in an array and returns its position, with options for match type and search direction. Use it as a more capable replacement for MATCH - it supports wildcards, binary search, and reverse lookup.",
		examples: ["=XMATCH(A2, B2:B100, 0, -1) finds the last exact match position."]
	},
	xnpv: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"rate",
				"number",
				"Discount rate per year"
			],
			[
				"values",
				"range",
				"Cash flow amounts"
			],
			[
				"dates*",
				"range",
				"Corresponding dates for each cash flow"
			]
		],
		description: "Returns the Net Present Value of a series of cash flows at irregular dates, discounted at a specified rate. Use it when cash flows occur on specific but non-uniform dates - a more realistic alternative to NPV.",
		examples: ["=XNPV(rate, values, dates)."]
	},
	xor: {
		tier: 0,
		category: 6,
		tags: [],
		args: [[
			"logical1",
			"logical",
			"First condition to evaluate"
		], [
			"...",
			"logical",
			"Additional conditions; returns TRUE if an odd number of them are TRUE"
		]],
		description: "Returns TRUE if an odd number of its arguments are TRUE (exclusive OR). Use it to detect whether exactly one of two conditions is met - for instance, when a record must have a start date or an end date but not both.",
		examples: ["=XOR(ISBLANK(A2), ISBLANK(B2)) returns TRUE when exactly one date is missing."]
	},
	year: {
		tier: 0,
		category: 2,
		tags: [],
		args: [[
			"date",
			"date",
			"Date value from which to extract the four-digit year"
		]],
		description: "Extracts the four-digit year from a date value. Use it to group data by year, filter records to a specific year, or build year-over-year calculations.",
		examples: ["=YEAR(A2) returns 2025 for any date in that year."]
	},
	yearfrac: {
		tier: 0,
		category: 2,
		tags: [],
		args: [
			[
				"start_date",
				"date",
				"Start of the period"
			],
			[
				"end_date",
				"date",
				"End of the period"
			],
			[
				"basis*",
				"integer",
				"Day-count convention: 0=US 30/360 (default), 1=actual/actual, 2=actual/360, 3=actual/365, 4=European 30/360"
			]
		],
		description: "Returns the fraction of a year represented by the number of days between two dates, using a specified day-count basis. Use it for financial calculations such as accrued interest, partial-year proration, or annualized returns.",
		examples: ["=YEARFRAC(A2, B2, 1) returns the actual fraction of a year between the two dates."]
	},
	yield: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"pr",
				"number",
				"Price per $100 face value"
			],
			[
				"redemption",
				"number",
				"Redemption value per $100 face value"
			],
			[
				"frequency",
				"integer",
				"Coupon payments per year: 1=annual, 2=semiannual, 4=quarterly"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the annual yield of a security that pays periodic interest, the return earned by holding a bond bought at a given price to maturity. It is the inverse of PRICE: the yield at which the bond's cash flows discount back to pr.",
		examples: ["=YIELD(A2, B2, 0.05, 98, 100, 2, 0) returns the yield of a semiannual bond bought below par."]
	},
	yielddisc: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date of the security"
			],
			[
				"maturity",
				"date",
				"Maturity date of the security"
			],
			[
				"pr",
				"number",
				"Price per $100 face value"
			],
			[
				"redemption",
				"number",
				"Redemption value per $100 face value"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the annualised yield of a discounted security such as a Treasury bill.",
		examples: ["=YIELDDISC(A2, B2, 97, 100, 0) returns the annual yield for a T-bill priced at 97."]
	},
	yieldmat: {
		tier: 0,
		category: 4,
		tags: [],
		args: [
			[
				"settlement",
				"date",
				"Settlement date"
			],
			[
				"maturity",
				"date",
				"Maturity date"
			],
			[
				"issue",
				"date",
				"Issue date"
			],
			[
				"rate",
				"number",
				"Annual coupon rate as a decimal"
			],
			[
				"pr",
				"number",
				"Price per $100 face value"
			],
			[
				"basis*",
				"integer",
				"Day-count convention (0=US 30/360 default)"
			]
		],
		description: "Returns the annual yield of a security that pays interest only at maturity.",
		examples: ["=YIELDMAT(A2, B2, C2, 0.05, 99, 0) returns the yield of a maturity-interest bond priced at 99."]
	},
	"z.test": {
		tier: 0,
		category: 9,
		tags: [],
		args: [
			[
				"array",
				"range",
				"The data set to test the value against"
			],
			[
				"x",
				"number",
				"Hypothesized population mean to test"
			],
			[
				"sigma*",
				"number",
				"Known population standard deviation; if omitted, the sample standard deviation is used"
			]
		],
		description: "Returns the one-tailed p-value of a z-test - the probability that the sample mean is at least as extreme as observed, given a hypothesized population mean. Use it to test whether a sample mean is consistent with a known or assumed population mean.",
		examples: ["=Z.TEST(A2:A30, 50, 10) tests the sample against a hypothesized mean of 50 with standard deviation 10."]
	},
	ztest: {
		tier: 0,
		category: 11,
		tags: [],
		args: [
			[
				"array",
				"number_or_range",
				"Data values"
			],
			[
				"x",
				"number",
				"Value to test against"
			],
			[
				"sigma*",
				"number",
				"Population standard deviation; if omitted, the sample standard deviation is used"
			]
		],
		description: "Compatibility name for Z.TEST. Prefer Z.TEST in new formulas.",
		examples: ["=ZTEST(A2:A20, 4) is equivalent to =Z.TEST(A2:A20, 4)."]
	}
}, At = Object.keys(kt).map((e) => e.toUpperCase()).sort();
function jt(e) {
	return kt[e.toLowerCase()];
}
function Mt(e) {
	let t = e.match(/^.*?[.!?](\s|$)/);
	return (t ? t[0] : e).trim();
}
var Nt = {
	1: "database",
	2: "date_and_time",
	3: "engineering",
	4: "financial",
	5: "information",
	6: "logical",
	7: "lookup_and_reference",
	8: "math_and_trigonometry",
	9: "statistical",
	10: "text"
};
function Pt(e, t) {
	let n = Nt[t];
	if (!n) return null;
	let r = e.toLowerCase(), i = r.replace(/[ .]/g, "-"), a = `https://docs.ironcalc.com/functions/${n}/${r}.html`;
	return i === r ? a : `${a}#${i}`;
}
function Ft(e) {
	return e === "..." ? "…" : e.endsWith("*") ? `[${e.slice(0, -1)}]` : e;
}
function It(e, t, n) {
	let r;
	try {
		let [i, a, o] = e.getSelectedCell(), s = Array.from(t.slice(0, n)).length;
		r = e.getFormulaCompletion(i, a, o, t, s);
	} catch (e) {
		return console.error("getCompletion: getFormulaCompletion failed", e), null;
	}
	let i = r.expecting.find((e) => typeof e == "object" && "Argument" in e);
	if (i) {
		let [e, t] = i.Argument;
		return jt(e) ? {
			kind: "detail",
			name: e,
			activeIndex: t - 1
		} : null;
	}
	let a = r.expecting.find((e) => typeof e == "object" && "FunctionName" in e);
	if (a) {
		let e = a.FunctionName.toUpperCase(), t = At.filter((t) => t.startsWith(e));
		return t.length === 0 ? null : {
			kind: "list",
			prefix: e,
			matches: t,
			replaceFrom: r.replace_from
		};
	}
	return null;
}
function Lt(e, t, n, r) {
	let i = Math.min(Math.max(r, 0), n.matches.length - 1), a = `${n.matches[i]}(`, o = +!!e.startsWith("="), s = n.replaceFrom + o, c = Array.from(e).slice(0, s).join("").length;
	return {
		text: e.slice(0, c) + a + e.slice(t),
		cursor: c + a.length
	};
}
//#endregion
//#region src/components/FormulaHelper/FormulaHelper.tsx
function Rt(e) {
	e.preventDefault(), e.stopPropagation();
}
function zt(e) {
	e.stopPropagation();
}
function Bt({ completion: e, selected: t, onSelect: n, onAccept: r }) {
	return e ? e.kind === "list" ? /* @__PURE__ */ G(Vt, {
		matches: e.matches,
		prefix: e.prefix,
		selected: t,
		onSelect: n,
		onAccept: r
	}) : /* @__PURE__ */ G(Ut, {
		name: e.name,
		activeIndex: e.activeIndex
	}) : null;
}
function Vt({ matches: e, prefix: t, selected: n, onSelect: r, onAccept: i }) {
	let a = Math.min(Math.max(n, 0), e.length - 1), o = _((e) => {
		e?.scrollIntoView({
			block: "nearest",
			inline: "nearest"
		});
	}, []);
	return /* @__PURE__ */ G("div", {
		className: "ic-fh ic-fh-list",
		onPointerDown: Rt,
		onClick: zt,
		children: e.map((e, n) => {
			let s = jt(e), c = n === a;
			return /* @__PURE__ */ K("button", {
				type: "button",
				ref: c ? o : void 0,
				className: `ic-fh-list-item${c ? " ic-fh-selected" : ""}`,
				onMouseEnter: () => r(n),
				onClick: () => i(n),
				children: [/* @__PURE__ */ K("span", {
					className: "ic-fh-name",
					children: [/* @__PURE__ */ G("span", {
						className: "ic-fh-name-match",
						children: t
					}), e.slice(t.length)]
				}), c && s ? /* @__PURE__ */ G("span", {
					className: "ic-fh-list-desc",
					children: Mt(s.description)
				}) : null]
			}, e);
		})
	});
}
var Ht = !1;
function Ut({ name: e, activeIndex: t }) {
	let [n, r] = T(Ht), i = () => {
		r((e) => (Ht = !e, Ht));
	}, a = jt(e);
	if (!a) return null;
	let o = a.args, s = Pt(e, a.category), c = Math.min(t, o.length - 1);
	return /* @__PURE__ */ K("div", {
		className: "ic-fh",
		onPointerDown: Rt,
		onClick: zt,
		children: [/* @__PURE__ */ K("div", {
			className: "ic-fh-header",
			children: [/* @__PURE__ */ K("div", {
				className: "ic-fh-header-main",
				children: [/* @__PURE__ */ K("div", {
					className: "ic-fh-signature",
					children: [
						/* @__PURE__ */ G("span", {
							className: "ic-fh-fn-name",
							children: e.toUpperCase()
						}),
						" ( ",
						o.map((e, t) => /* @__PURE__ */ K(p, { children: [t > 0 ? /* @__PURE__ */ G("span", {
							className: "ic-fh-comma",
							children: ", "
						}) : null, /* @__PURE__ */ G("span", {
							className: `ic-fh-arg${t === c ? " ic-fh-arg-active" : ""}`,
							children: Ft(e[0])
						})] }, e[0])),
						" )"
					]
				}), n ? null : /* @__PURE__ */ K("div", {
					className: "ic-fh-desc",
					children: [a.description, s ? /* @__PURE__ */ G("a", {
						className: "ic-fh-link",
						href: s,
						target: "_blank",
						rel: "noreferrer",
						children: "Read more"
					}) : null]
				})]
			}), /* @__PURE__ */ G(J, {
				icon: /* @__PURE__ */ G(se, {
					size: 16,
					style: { transform: n ? "rotate(180deg)" : void 0 }
				}),
				"aria-label": n ? "Expand" : "Collapse",
				title: n ? "Expand" : "Collapse",
				size: "xs",
				className: "ic-fh-collapse-btn",
				onClick: i
			})]
		}), n || a.examples.length === 0 ? null : /* @__PURE__ */ K("div", {
			className: "ic-fh-body",
			children: [/* @__PURE__ */ G("div", {
				className: "ic-fh-examples-label",
				children: "Examples"
			}), a.examples.map((e) => /* @__PURE__ */ G("div", {
				className: "ic-fh-example",
				children: e
			}, e))]
		})]
	});
}
//#endregion
//#region src/components/createAnchoredPortal.ts
function Wt(e, t) {
	let n = t?.closest(".ic-root");
	return n ? ut(e, n) : null;
}
//#endregion
//#region src/components/Modal/ModalDialog.tsx
function Gt({ modalRef: e, titleId: t, onClose: n, onKeyDown: r, className: i, children: a }) {
	let [o, s] = T(null);
	return /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G("span", {
		ref: s,
		hidden: !0
	}), Wt(/* @__PURE__ */ G("div", {
		className: "ic-modal-dialog-backdrop",
		onClick: n,
		onPointerDown: (e) => e.stopPropagation(),
		role: "none",
		children: /* @__PURE__ */ G("div", {
			ref: e,
			className: ["ic-modal-dialog", i].filter(Boolean).join(" "),
			onClick: (e) => e.stopPropagation(),
			onKeyDown: r,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": t,
			tabIndex: -1,
			children: a
		})
	}), o)] });
}
//#endregion
//#region src/components/Modal/useModalFocus.ts
function Kt(e) {
	let t = w(null), n = w(null);
	y(() => {
		e && (n.current = document.activeElement, requestAnimationFrame(() => {
			t.current?.contains(document.activeElement) || t.current?.focus();
		}));
	}, [e]);
	function r() {
		n.current?.focus();
	}
	return {
		modalRef: t,
		restoreFocus: r
	};
}
//#endregion
//#region src/components/Modal/useModalKeyDown.ts
function qt({ focusableElements: e, onClose: t, onConfirm: n }) {
	return { onKeyDown: _((r) => {
		if (r.key === "Escape") r.stopPropagation(), t();
		else if (r.key === "Enter" && (r.metaKey || r.ctrlKey)) r.preventDefault(), n?.();
		else if (r.key === "Tab") {
			let t = e[0]?.current, n = e[e.length - 1]?.current;
			if (!t || !n) return;
			r.shiftKey ? document.activeElement === t && (r.preventDefault(), n.focus()) : document.activeElement === n && (r.preventDefault(), t.focus());
		}
	}, [
		e,
		t,
		n
	]) };
}
//#endregion
//#region src/components/Modal/Alert.tsx
function Jt({ open: e, onClose: t, title: n, message: r, confirmLabel: i = "OK", closeLabel: a = "Close" }) {
	let o = `${b()}-title`, { modalRef: s, restoreFocus: c } = Kt(e), l = w(null), u = w(null), d = () => {
		t(), c();
	}, { onKeyDown: f } = qt({
		focusableElements: [l, u],
		onClose: d,
		onConfirm: d
	});
	return e ? /* @__PURE__ */ K(Gt, {
		modalRef: s,
		titleId: o,
		onClose: d,
		onKeyDown: f,
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-modal-dialog-header",
				children: [/* @__PURE__ */ G("h2", {
					id: o,
					children: n
				}), /* @__PURE__ */ G(J, {
					ref: l,
					icon: /* @__PURE__ */ G(lt, {}),
					"aria-label": a,
					onClick: d
				})]
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-modal-dialog-body",
				children: typeof r == "string" ? /* @__PURE__ */ G("p", { children: r }) : r
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-modal-dialog-footer",
				children: /* @__PURE__ */ G(q, {
					ref: u,
					size: "md",
					onClick: d,
					autoFocus: !0,
					children: i
				})
			})
		]
	}) : null;
}
Jt.displayName = "Alert";
//#endregion
//#region src/components/Modal/Confirm.tsx
function Yt({ open: e, onClose: t, onConfirm: n, title: r, message: i, confirmLabel: a = "OK", cancelLabel: o = "Cancel", closeLabel: s = "Close", variant: c = "default" }) {
	let l = `${b()}-title`, { modalRef: u, restoreFocus: d } = Kt(e), f = w(null), p = w(null), m = () => {
		t(), d();
	}, h = () => {
		n(), m();
	}, { onKeyDown: g } = qt({
		focusableElements: [f, p],
		onClose: m,
		onConfirm: h
	});
	return e ? /* @__PURE__ */ K(Gt, {
		modalRef: u,
		titleId: l,
		onClose: m,
		onKeyDown: g,
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-modal-dialog-header",
				children: [/* @__PURE__ */ G("h2", {
					id: l,
					children: r
				}), /* @__PURE__ */ G(J, {
					ref: f,
					icon: /* @__PURE__ */ G(lt, {}),
					"aria-label": s,
					onClick: m
				})]
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-modal-dialog-body",
				children: typeof i == "string" ? /* @__PURE__ */ G("p", { children: i }) : i
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-modal-dialog-footer",
				children: [/* @__PURE__ */ G(q, {
					size: "md",
					variant: "secondary",
					onClick: m,
					children: o
				}), /* @__PURE__ */ G(q, {
					ref: p,
					size: "md",
					autoFocus: !0,
					variant: c === "destructive" ? "destructive" : void 0,
					onClick: h,
					children: a
				})]
			})
		]
	}) : null;
}
Yt.displayName = "Confirm";
//#endregion
//#region src/components/Input/Input.tsx
var Y = g(function({ size: e = "md", label: t, helperText: n, error: r = !1, disabled: i = !1, startAdornment: a, endAdornment: o, required: s, id: c, className: l, style: u, ...d }, f) {
	let p = b(), m = c ?? p, h = `${m}-helper`, [g, _] = T(!1), v = (e, t) => {
		let n = Number(d.value) || 0, r = d.step === void 0 || d.step === "any" ? 1 : Number(d.step) || 1, i = t.shiftKey ? r * 10 : r, a = d.min === void 0 ? -Infinity : Number(d.min), o = d.max === void 0 ? Infinity : Number(d.max), s = e === "up" ? n + i : n - i, c = Math.max(a, Math.min(o, s));
		d.onChange?.({ target: { value: `${c}` } });
	}, y = [
		"ic-input-control",
		`${e}`,
		r && "is-error",
		i && "is-disabled",
		d.type !== "number" && a && "has-start",
		d.type !== "number" && o && "has-end",
		d.type === "number" && "is-number-input"
	].filter(Boolean).join(" "), x = /* @__PURE__ */ G("div", {
		className: y,
		children: d.type === "number" ? /* @__PURE__ */ K(W, { children: [
			/* @__PURE__ */ G(J, {
				icon: /* @__PURE__ */ G(Oe, {}),
				"aria-label": "Decrease",
				type: "button",
				variant: "ghost",
				size: "xs",
				disabled: i,
				className: "ic-input-number-btn",
				onClick: (e) => {
					e.stopPropagation(), v("down", e);
				}
			}),
			g ? /* @__PURE__ */ G("input", {
				ref: f,
				id: m,
				disabled: i,
				required: s,
				"aria-invalid": r || void 0,
				"aria-describedby": n ? h : void 0,
				spellCheck: !1,
				...d,
				autoFocus: !0,
				onBlur: () => _(!1),
				onKeyDown: (e) => {
					e.stopPropagation(), e.key === "Escape" ? _(!1) : e.key === "Enter" && (_(!1), d.onKeyDown?.(e));
				},
				onClick: (e) => e.stopPropagation(),
				onPaste: (e) => e.stopPropagation(),
				onCopy: (e) => e.stopPropagation(),
				onCut: (e) => e.stopPropagation(),
				onFocus: (e) => e.target.select()
			}) : /* @__PURE__ */ K("button", {
				type: "button",
				id: m,
				className: "ic-input-number-display",
				disabled: i,
				"aria-invalid": r || void 0,
				"aria-describedby": n ? h : void 0,
				onClick: (e) => {
					e.stopPropagation(), _(!0);
				},
				children: [/* @__PURE__ */ G("span", { children: d.value }), o && /* @__PURE__ */ G("span", {
					className: "ic-input-number-unit",
					children: o
				})]
			}),
			/* @__PURE__ */ G(J, {
				icon: /* @__PURE__ */ G(Ie, {}),
				"aria-label": "Increase",
				type: "button",
				variant: "ghost",
				size: "xs",
				disabled: i,
				className: "ic-input-number-btn",
				onClick: (e) => {
					e.stopPropagation(), v("up", e);
				}
			})
		] }) : /* @__PURE__ */ K(W, { children: [
			a && /* @__PURE__ */ G("span", { children: a }),
			/* @__PURE__ */ G("input", {
				ref: f,
				id: m,
				disabled: i,
				required: s,
				"aria-invalid": r || void 0,
				"aria-describedby": n ? h : void 0,
				onKeyDown: (e) => e.stopPropagation(),
				onClick: (e) => e.stopPropagation(),
				onPaste: (e) => e.stopPropagation(),
				onCopy: (e) => e.stopPropagation(),
				onCut: (e) => e.stopPropagation(),
				onFocus: (e) => e.target.select(),
				spellCheck: !1,
				...d
			}),
			o && /* @__PURE__ */ G("span", { children: o })
		] })
	});
	return /* @__PURE__ */ K("div", {
		className: ["ic-input", l].filter(Boolean).join(" "),
		style: u,
		children: [
			t && /* @__PURE__ */ G("label", {
				htmlFor: m,
				"data-required": s || void 0,
				children: t
			}),
			x,
			n && /* @__PURE__ */ G("p", {
				id: h,
				children: n
			})
		]
	});
});
Y.displayName = "Input";
//#endregion
//#region src/components/Modal/Prompt.tsx
function Xt({ open: e, onClose: t, onSubmit: n, title: r, message: i, defaultValue: a = "", confirmLabel: o = "OK", cancelLabel: s = "Cancel", closeLabel: c = "Close", className: l, inputProps: u }) {
	let d = `${b()}-title`, { modalRef: f, restoreFocus: p } = Kt(e), m = w(null), h = w(null), [g, _] = T(a);
	y(() => {
		e && _(a);
	}, [e, a]);
	let v = () => {
		t(), p();
	}, x = () => {
		n(g), v();
	}, { onKeyDown: S } = qt({
		focusableElements: [m, h],
		onClose: v,
		onConfirm: x
	});
	return e ? /* @__PURE__ */ K(Gt, {
		modalRef: f,
		titleId: d,
		onClose: v,
		onKeyDown: S,
		className: l,
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-modal-dialog-header",
				children: [/* @__PURE__ */ G("h2", {
					id: d,
					children: r
				}), /* @__PURE__ */ G(J, {
					ref: m,
					icon: /* @__PURE__ */ G(lt, {}),
					"aria-label": c,
					onClick: v
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-modal-dialog-body",
				children: [i && (typeof i == "string" ? /* @__PURE__ */ G("p", { children: i }) : i), /* @__PURE__ */ G(Y, {
					autoFocus: !0,
					...u,
					value: g,
					onChange: (e) => _(e.target.value),
					onKeyDown: (e) => {
						e.stopPropagation(), e.key === "Escape" ? (e.preventDefault(), v()) : e.key === "Enter" && (e.preventDefault(), h.current?.focus()), u?.onKeyDown?.(e);
					},
					onClick: (e) => {
						e.stopPropagation(), u?.onClick?.(e);
					}
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-modal-dialog-footer",
				children: [/* @__PURE__ */ G(q, {
					size: "md",
					variant: "secondary",
					onClick: v,
					children: s
				}), /* @__PURE__ */ G(q, {
					ref: h,
					size: "md",
					onClick: x,
					children: o
				})]
			})
		]
	}) : null;
}
Xt.displayName = "Prompt";
//#endregion
//#region src/components/utils/useMenuPosition.ts
function Zt(e, t) {
	let n = e.getBoundingClientRect(), r = t.offsetWidth, i = t.offsetHeight, a = window.innerWidth, o = window.innerHeight, s = o - n.bottom - 8, c = n.top - 8, l = s >= i + 4 || s >= c, u = n.left, d = u + r > a - 8 ? n.right - r : u, f = l ? n.bottom + 4 : n.top - i - 4;
	return d + r > a - 8 && (d = a - r - 8), d < 8 && (d = 8), f + i > o - 8 && (f = o - i - 8), f < 8 && (f = 8), {
		top: f,
		left: d
	};
}
function Qt(e, t) {
	let n = w(null), r = w(null), [i, a] = T({});
	return S(() => {
		if (!e) return;
		let i = t ?? n;
		function o() {
			let e = i.current, t = r.current;
			if (!e || !t) return;
			let { top: n, left: o } = Zt(e, t);
			a({
				top: n,
				left: o
			});
		}
		o();
		let s = new ResizeObserver(o);
		return i.current && s.observe(i.current), r.current && s.observe(r.current), window.addEventListener("resize", o), window.addEventListener("scroll", o, !0), () => {
			s.disconnect(), window.removeEventListener("resize", o), window.removeEventListener("scroll", o, !0);
		};
	}, [e, t]), {
		triggerRef: n,
		menuRef: r,
		position: i
	};
}
//#endregion
//#region src/components/WorksheetCanvas/constants.ts
var $t = 16384, en = 1048576;
//#endregion
//#region src/components/util.ts
function tn(e, t, n) {
	return e.find((e) => t >= e.row && t < e.row + e.height && n >= e.column && n < e.column + e.width);
}
function nn(e, t) {
	let n = Math.min(t.rowStart, t.rowEnd), r = Math.max(t.rowStart, t.rowEnd), i = Math.min(t.columnStart, t.columnEnd), a = Math.max(t.columnStart, t.columnEnd), o = !0;
	for (; o;) {
		o = !1;
		for (let t of e) {
			let e = t.row + t.height - 1, s = t.column + t.width - 1;
			t.row <= r && e >= n && t.column <= a && s >= i && (t.row < n && (n = t.row, o = !0), e > r && (r = e, o = !0), t.column < i && (i = t.column, o = !0), s > a && (a = s, o = !0));
		}
	}
	let s = t.rowStart <= t.rowEnd, c = t.columnStart <= t.columnEnd;
	return {
		rowStart: s ? n : r,
		rowEnd: s ? r : n,
		columnStart: c ? i : a,
		columnEnd: c ? a : i
	};
}
function rn(e, t, n, r) {
	if (r <= 0) return 0;
	let i = n === "rowsDown" || n === "rowsUp", a = i ? t.rowEnd - t.rowStart + 1 : t.columnEnd - t.columnStart + 1, o = [];
	for (let n of e) {
		let e = n.row + n.height - 1, r = n.column + n.width - 1;
		n.row <= t.rowEnd && e >= t.rowStart && n.column <= t.columnEnd && r >= t.columnStart && o.push(i ? [n.row - t.rowStart, e - t.rowStart] : [n.column - t.columnStart, r - t.columnStart]);
	}
	if (o.length === 0) return r;
	let s = n === "rowsUp" || n === "columnsLeft", c = (e) => {
		let t = s ? a - e : e;
		return o.some(([e, n]) => e < t && n >= t);
	}, l = r;
	for (; l > 0 && l % a !== 0 && c(l % a);) --l;
	return l;
}
function an(e, t, n, r) {
	let i = tn(e.getMergedCells(t), n, r);
	if (!i) return {
		width: e.getColumnWidth(t, r),
		height: e.getRowHeight(t, n)
	};
	let a = 0;
	for (let n = i.column; n < i.column + i.width; n += 1) a += e.getColumnWidth(t, n);
	let o = 0;
	for (let n = i.row; n < i.row + i.height; n += 1) o += e.getRowHeight(t, n);
	return {
		width: a,
		height: o
	};
}
function on(e) {
	if (e.length !== 1) return !1;
	let t = e.codePointAt(0) ?? 0;
	return t > 0 && t < 255;
}
var sn = (e) => [
	"ArrowRight",
	"ArrowLeft",
	"ArrowDown",
	"ArrowUp",
	"Home",
	"End"
].includes(e), cn = (e, t, n) => n ? `$${i(t)}$${e}` : `${i(t)}${e}`;
function ln(e, { absolute: t = !1, sheetName: n = "" } = {}) {
	let r = Math.min(e.rowStart, e.rowEnd), i = Math.max(e.rowStart, e.rowEnd), a = Math.min(e.columnStart, e.columnEnd), o = Math.max(e.columnStart, e.columnEnd), s = n ? `${n}!` : "", c = cn(r, a, t);
	return r === i && a === o ? `${s}${c}` : `${s}${c}:${cn(i, o, t)}`;
}
var un = (e, t) => {
	let { rowStart: n, rowEnd: r, columnStart: a, columnEnd: o } = e;
	if (n === r && a === o) return cn(t.row, t.column, !1);
	let s = Math.min(n, r), c = Math.max(n, r), l = Math.min(a, o), u = Math.max(a, o);
	return s === 1 && c === 1048576 ? `${i(l)}:${i(u)}` : l === 1 && u === 16384 ? `${s}:${c}` : ln(e);
};
function dn(e, t, n) {
	return ln(e, { sheetName: e.sheet === t ? "" : d(n) });
}
function fn(e, t) {
	let [n, r, i, a] = e.range;
	return ln({
		rowStart: n,
		rowEnd: i,
		columnStart: r,
		columnEnd: a
	}, {
		absolute: !0,
		sheetName: d(t[e.sheet])
	});
}
function pn(e) {
	return e ? Array.from(e.querySelectorAll("button, input, [href], [tabindex]:not([tabindex=\"-1\"])")).filter((e) => !e.hasAttribute("disabled") && e.getAttribute("aria-hidden") !== "true" && e.tabIndex !== -1) : [];
}
//#endregion
//#region src/components/Editor/util.tsx
function mn(e, t, n) {
	return Array.from(e).slice(t, n).join("");
}
function hn(e) {
	return typeof e == "object" && "Reference" in e;
}
function gn(e) {
	return typeof e == "object" && "Range" in e;
}
function _n(e) {
	return typeof e == "object" && "DynamicAnchor" in e;
}
function vn(e) {
	return typeof e == "object" ? "Ident" in e || "Number" in e || "String" in e || "Boolean" in e || "Reference" in e || "Range" in e : e === "LeftParenthesis" || e === "LeftBrace";
}
function yn(e) {
	return e === "Comma" || e === "Semicolon";
}
function bn(e, t, n) {
	if (!t.startsWith("=")) return !1;
	try {
		let [r, i, a] = e.getSelectedCell(), o = Array.from(t.slice(0, n)).length, { expecting: s } = e.getFormulaCompletion(r, i, a, t, o);
		return s.includes("Range");
	} catch (e) {
		return console.error("Error in isInReferenceMode:", e), !1;
	}
}
function xn(e, t = 1) {
	let n = [
		{
			name: "Cyan",
			rgba: [
				89,
				185,
				188,
				1
			],
			hex: "#59B9BC"
		},
		{
			name: "Flamingo",
			rgba: [
				236,
				87,
				83,
				1
			],
			hex: "#EC5753"
		},
		{
			hex: "#3358B7",
			rgba: [
				51,
				88,
				183,
				1
			],
			name: "Blue"
		},
		{
			hex: "#F8CD3C",
			rgba: [
				248,
				205,
				60,
				1
			],
			name: "Yellow"
		},
		{
			hex: "#3BB68A",
			rgba: [
				59,
				182,
				138,
				1
			],
			name: "Emerald"
		},
		{
			hex: "#523E93",
			rgba: [
				82,
				62,
				147,
				1
			],
			name: "Violet"
		},
		{
			hex: "#A23C52",
			rgba: [
				162,
				60,
				82,
				1
			],
			name: "Burgundy"
		},
		{
			hex: "#8CB354",
			rgba: [
				162,
				60,
				82,
				1
			],
			name: "Wasabi"
		},
		{
			hex: "#D03627",
			rgba: [
				208,
				54,
				39,
				1
			],
			name: "Red"
		},
		{
			hex: "#1B717E",
			rgba: [
				27,
				113,
				126,
				1
			],
			name: "Teal"
		}
	];
	if (t === 1) return n[e % 10].hex;
	let { rgba: r } = n[e % 10];
	return `rgba(${r[0]}, ${r[1]}, ${r[2]}, ${t})`;
}
var Sn = /* @__PURE__ */ G("span", {
	className: "ic-insert-range-hint",
	children: "  "
}, "reference-hint");
function Cn(e, t, n) {
	let r = [], i = [], a = 0;
	if (t.startsWith("=")) {
		let o = t.slice(1), s = l(o), c = s.length, u = {}, d = e.getSelectedSheet(), f = e.getWorksheetsProperties().map((e) => e.name), p = n !== void 0 && bn(e, t, n), m = n === void 0 ? -1 : Array.from(t.slice(0, n)).length - 1, h = !1;
		for (let t = 0; t < c; t += 1) {
			let { token: n, start: c, end: l } = s[t], g = hn(n), _ = gn(n);
			if (p && !h && c >= m) {
				let e = t > 0 ? s[t - 1].token : void 0, i = n === "RightParenthesis" && e !== void 0 && yn(e);
				!vn(n) && !i && r.push(Sn), h = !0;
			}
			if (g && s[t + 1] && s[t + 1].token === "Spill") {
				let { sheet: l, row: p, column: m } = n.Reference, h = l ? f.indexOf(l) : d, g = e.getCellArrayStructure(h, p, m);
				if (_n(g)) {
					let [e, n] = g.DynamicAnchor, l = p + n - 1, d = m + e - 1, f = `${h}-${p}-${m}:${l}-${d}`, _ = u[f];
					_ || (_ = xn(a), u[f] = _, a += 1), r.push(/* @__PURE__ */ G("span", {
						style: { color: _ },
						children: mn(o, c, s[t + 1].end)
					}, t)), i.push({
						sheet: h,
						rowStart: p,
						columnStart: m,
						rowEnd: l,
						columnEnd: d,
						color: _
					});
				} else r.push(/* @__PURE__ */ G("span", { children: mn(o, c, s[t + 1].end) }, t));
				t += 1;
			} else if (g) {
				let { sheet: e, row: s, column: p } = n.Reference, m = e ? f.indexOf(e) : d, h = `${m}-${s}-${p}`, g = u[h];
				g || (g = xn(a), u[h] = g, a += 1), r.push(/* @__PURE__ */ G("span", {
					style: { color: g },
					children: mn(o, c, l)
				}, t)), i.push({
					sheet: m,
					rowStart: s,
					columnStart: p,
					rowEnd: s,
					columnEnd: p,
					color: g
				});
			} else if (_) {
				let { sheet: e, left: { row: s, column: p }, right: { row: m, column: h } } = n.Range, g = e ? f.indexOf(e) : d, _ = `${g}-${s}-${p}:${m}-${h}`, v = u[_];
				v || (v = xn(a), u[_] = v, a += 1), s > m && ([s, m] = [m, s]), p > h && ([p, h] = [h, p]), r.push(/* @__PURE__ */ G("span", {
					style: { color: v },
					children: mn(o, c, l)
				}, t)), i.push({
					sheet: g,
					rowStart: s,
					columnStart: p,
					rowEnd: m,
					columnEnd: h,
					color: v
				});
			} else r.push(/* @__PURE__ */ G("span", { children: mn(o, c, l) }, t));
		}
		p && !h && r.push(Sn), r = [/* @__PURE__ */ G("span", { children: "=" }, "equals")].concat(r);
	} else r = [/* @__PURE__ */ G("span", { children: t }, "single")];
	return t.endsWith("\n") && r.push(/* @__PURE__ */ G("span", { children: "\n" }, "trailing-newline")), {
		html: r,
		activeRanges: i
	};
}
function wn(e, t) {
	let n = e.getWorksheetsProperties(), { token: r } = l(t)[0];
	if (gn(r)) {
		let { sheet: e, left: { row: t, column: i }, right: { row: a, column: o } } = r.Range;
		if (e !== null) {
			let r = n.findIndex((t) => t.name === e);
			if (r >= 0) return [
				r,
				t,
				i,
				a,
				o
			];
		}
	} else if (hn(r)) {
		let { sheet: e, row: t, column: i } = r.Reference;
		if (e !== null) {
			let r = n.findIndex((t) => t.name === e);
			if (r >= 0) return [
				r,
				t,
				i,
				t,
				i
			];
		}
	}
	return null;
}
var Tn = (e) => {
	let t = /^([A-Za-z]+)(\d+)$/.exec(e.trim());
	if (!t) throw Error(`Invalid cell: "${e}"`);
	return {
		col: a(t[1]),
		row: parseInt(t[2], 10)
	};
}, En = (e) => {
	let [t, n] = e.split(":"), r = Tn(t), i = n ? Tn(n) : r;
	return {
		minCol: Math.min(r.col, i.col),
		maxCol: Math.max(r.col, i.col),
		minRow: Math.min(r.row, i.row),
		maxRow: Math.max(r.row, i.row)
	};
};
function Dn(e, t) {
	let n = En(e), r = t.trim().split(/\s+/).filter(Boolean).map(En), i = (e, t) => r.some((n) => e >= n.minCol && e <= n.maxCol && t >= n.minRow && t <= n.maxRow);
	for (let e = n.minCol; e <= n.maxCol; e++) for (let t = n.minRow; t <= n.maxRow; t++) if (!i(e, t)) return !1;
	return !0;
}
function On(e, t) {
	try {
		return Dn(e, t);
	} catch (e) {
		return console.error("Error in isRangeInRanges:", e), !1;
	}
}
function kn(e) {
	let t = "[A-Z]+[1-9][0-9]*", n = `${t}(?::${t})?`;
	return RegExp(`^${n}(?: ${n})*$`).test(e);
}
//#endregion
//#region src/components/Editor/useKeyDown.ts
function An(e) {
	let { rowStart: t, rowEnd: n, columnStart: r, columnEnd: i } = e;
	return !(t < 1 || t > 1048576 || n < 1 || n > 1048576 || r < 1 || r > 16384 || i < 1 || i > 16384);
}
var jn = (e) => {
	let { model: t, onEditEnd: n, onTextUpdated: r, workbookState: i, textareaRef: a } = e;
	return { onKeyDown: _((e) => {
		let { key: o, shiftKey: s, altKey: c, ctrlKey: l } = e, u = a.current, d = i.getEditingCell();
		if (u && d) switch (o) {
			case "Enter":
				if (c) {
					let t = u.selectionStart, n = u.selectionEnd, a = u.value;
					d.text = `${a.slice(0, t)}\n${a.slice(n)}`, i.setEditingCell(d), setTimeout(() => {
						u.setSelectionRange(t + 1, t + 1);
					}, 0), e.stopPropagation(), e.preventDefault(), r();
					return;
				}
				if (e.stopPropagation(), e.preventDefault(), l && s) {
					let [e, n, r, a] = t.getSelectedView().range, o = a - n + 1, s = r - e + 1;
					t.setUserArrayFormula(d.sheet, d.row, d.column, o, s, i.getEditingText()), t.onArrowDown();
				} else t.setUserInput(d.sheet, d.row, d.column, i.getEditingText()), s ? t.onArrowUp() : t.onArrowDown();
				i.clearEditingCell(), n();
				return;
			case "Tab":
				t.setUserInput(d.sheet, d.row, d.column, i.getEditingText()), i.clearEditingCell(), s ? t.onArrowLeft() : t.onArrowRight(), a.current && (a.current.value = ""), e.stopPropagation(), e.preventDefault(), n();
				return;
			case "Escape": {
				let e = i.getEditingCell();
				e && t.setSelectedSheet(e.sheet), i.clearEditingCell(), n();
				return;
			}
			case "ArrowRight":
				if (d.mode === "edit") return;
				if (e.stopPropagation(), e.preventDefault(), d.referencedRange) {
					let e = t.getWorksheetsProperties().map((e) => e.name), n = d.referencedRange.range, a = t.getMergedCells(n.sheet), { anchorRow: o, anchorColumn: c } = d.referencedRange;
					if (s) {
						let e = (c === n.columnStart ? n.columnEnd : n.columnStart) + 1;
						if (e > 16384) return;
						n.columnStart = Math.min(c, e), n.columnEnd = Math.max(c, e), Object.assign(n, nn(a, n));
					} else {
						let e = o === n.rowStart ? n.rowEnd : n.rowStart, t = c === n.columnStart ? n.columnEnd : n.columnStart, r = tn(a, e, t), i = r ? r.column + r.width : t + 1, s = e;
						if (i > 16384) return;
						let l = tn(a, s, i);
						l && (s = l.row, i = l.column), n.columnStart = i, n.columnEnd = i, n.rowStart = s, n.rowEnd = s, o = s, c = i;
					}
					d.referencedRange = {
						range: n,
						str: dn(n, d.sheet, e[n.sheet]),
						anchorRow: o,
						anchorColumn: c
					}, i.setEditingCell(d), r();
					return;
				}
				if (bn(t, d.text, d.cursorStart)) {
					let e = t.getWorksheetsProperties().map((e) => e.name), n = t.getMergedCells(d.sheet), a = tn(n, d.row, d.column), o = a ? a.column + a.width : d.column + 1, s = {
						sheet: d.sheet,
						rowStart: d.row,
						rowEnd: d.row,
						columnStart: o,
						columnEnd: o
					};
					if (!An(s)) return;
					let c = tn(n, d.row, o);
					c && (s.rowStart = c.row, s.rowEnd = c.row, s.columnStart = c.column, s.columnEnd = c.column), d.referencedRange = {
						range: s,
						str: dn(s, d.sheet, e[s.sheet]),
						anchorRow: s.rowStart,
						anchorColumn: s.columnStart
					}, i.setEditingCell(d), r();
					return;
				}
				i.clearEditingCell(), t.setUserInput(d.sheet, d.row, d.column, d.text), t.setSelectedSheet(d.sheet), s || t.onArrowRight(), a.current && (a.current.value = ""), n();
				return;
			case "ArrowLeft":
				if (d.mode === "edit") return;
				if (e.stopPropagation(), e.preventDefault(), d.referencedRange) {
					let e = t.getWorksheetsProperties().map((e) => e.name), n = d.referencedRange.range, a = t.getMergedCells(n.sheet), { anchorRow: o, anchorColumn: c } = d.referencedRange;
					if (s) {
						let e = (c === n.columnStart ? n.columnEnd : n.columnStart) - 1;
						if (e < 1) return;
						n.columnStart = Math.min(c, e), n.columnEnd = Math.max(c, e), Object.assign(n, nn(a, n));
					} else {
						let e = o === n.rowStart ? n.rowEnd : n.rowStart, t = c === n.columnStart ? n.columnEnd : n.columnStart, r = tn(a, e, t), i = r ? r.column - 1 : t - 1, s = e;
						if (i < 1) return;
						let l = tn(a, s, i);
						l && (s = l.row, i = l.column), n.columnStart = i, n.columnEnd = i, n.rowStart = s, n.rowEnd = s, o = s, c = i;
					}
					d.referencedRange = {
						range: n,
						str: dn(n, d.sheet, e[n.sheet]),
						anchorRow: o,
						anchorColumn: c
					}, i.setEditingCell(d), r();
					return;
				}
				if (bn(t, d.text, d.cursorStart)) {
					let e = t.getWorksheetsProperties().map((e) => e.name), n = t.getMergedCells(d.sheet), a = tn(n, d.row, d.column), o = a ? a.column - 1 : d.column - 1, s = {
						sheet: d.sheet,
						rowStart: d.row,
						rowEnd: d.row,
						columnStart: o,
						columnEnd: o
					};
					if (!An(s)) return;
					let c = tn(n, d.row, o);
					c && (s.rowStart = c.row, s.rowEnd = c.row, s.columnStart = c.column, s.columnEnd = c.column), d.referencedRange = {
						range: s,
						str: dn(s, d.sheet, e[s.sheet]),
						anchorRow: s.rowStart,
						anchorColumn: s.columnStart
					}, i.setEditingCell(d), r();
					return;
				}
				i.clearEditingCell(), t.setUserInput(d.sheet, d.row, d.column, d.text), t.setSelectedSheet(d.sheet), s || t.onArrowLeft(), a.current && (a.current.value = ""), n();
				return;
			case "ArrowUp":
				if (d.mode === "edit") return;
				if (e.stopPropagation(), e.preventDefault(), d.referencedRange) {
					let e = t.getWorksheetsProperties().map((e) => e.name), n = d.referencedRange.range, a = t.getMergedCells(n.sheet), { anchorRow: o, anchorColumn: c } = d.referencedRange;
					if (s) {
						let e = (o === n.rowStart ? n.rowEnd : n.rowStart) - 1;
						if (e < 1) return;
						n.rowStart = Math.min(o, e), n.rowEnd = Math.max(o, e), Object.assign(n, nn(a, n));
					} else {
						let e = o === n.rowStart ? n.rowEnd : n.rowStart, t = c === n.columnStart ? n.columnEnd : n.columnStart, r = tn(a, e, t), i = r ? r.row - 1 : e - 1, s = t;
						if (i < 1) return;
						let l = tn(a, i, s);
						l && (i = l.row, s = l.column), n.columnStart = s, n.columnEnd = s, n.rowStart = i, n.rowEnd = i, o = i, c = s;
					}
					d.referencedRange = {
						range: n,
						str: dn(n, d.sheet, e[n.sheet]),
						anchorRow: o,
						anchorColumn: c
					}, i.setEditingCell(d), r();
					return;
				}
				if (bn(t, d.text, d.cursorStart)) {
					let e = t.getWorksheetsProperties().map((e) => e.name), n = t.getMergedCells(d.sheet), a = tn(n, d.row, d.column), o = a ? a.row - 1 : d.row - 1, s = {
						sheet: d.sheet,
						rowStart: o,
						rowEnd: o,
						columnStart: d.column,
						columnEnd: d.column
					};
					if (!An(s)) return;
					let c = tn(n, o, d.column);
					c && (s.rowStart = c.row, s.rowEnd = c.row, s.columnStart = c.column, s.columnEnd = c.column), d.referencedRange = {
						range: s,
						str: dn(s, d.sheet, e[s.sheet]),
						anchorRow: s.rowStart,
						anchorColumn: s.columnStart
					}, i.setEditingCell(d), r();
					return;
				}
				i.clearEditingCell(), t.setUserInput(d.sheet, d.row, d.column, d.text), t.setSelectedSheet(d.sheet), s || t.onArrowUp(), a.current && (a.current.value = ""), n();
				return;
			case "ArrowDown":
				if (d.mode === "edit") return;
				if (e.stopPropagation(), e.preventDefault(), d.referencedRange) {
					let e = t.getWorksheetsProperties().map((e) => e.name), n = d.referencedRange.range, a = t.getMergedCells(n.sheet), { anchorRow: o, anchorColumn: c } = d.referencedRange;
					if (s) {
						let e = (o === n.rowStart ? n.rowEnd : n.rowStart) + 1;
						if (e > 1048576) return;
						n.rowStart = Math.min(o, e), n.rowEnd = Math.max(o, e), Object.assign(n, nn(a, n));
					} else {
						let e = o === n.rowStart ? n.rowEnd : n.rowStart, t = c === n.columnStart ? n.columnEnd : n.columnStart, r = tn(a, e, t), i = r ? r.row + r.height : e + 1, s = t;
						if (i > 1048576) return;
						let l = tn(a, i, s);
						l && (i = l.row, s = l.column), n.columnStart = s, n.columnEnd = s, n.rowStart = i, n.rowEnd = i, o = i, c = s;
					}
					d.referencedRange = {
						range: n,
						str: dn(n, d.sheet, e[n.sheet]),
						anchorRow: o,
						anchorColumn: c
					}, i.setEditingCell(d), r();
					return;
				}
				if (bn(t, d.text, d.cursorStart)) {
					let e = t.getWorksheetsProperties().map((e) => e.name), n = t.getMergedCells(d.sheet), a = tn(n, d.row, d.column), o = a ? a.row + a.height : d.row + 1, s = {
						sheet: d.sheet,
						rowStart: o,
						rowEnd: o,
						columnStart: d.column,
						columnEnd: d.column
					};
					if (!An(s)) return;
					let c = tn(n, o, d.column);
					c && (s.rowStart = c.row, s.rowEnd = c.row, s.columnStart = c.column, s.columnEnd = c.column), d.referencedRange = {
						range: s,
						str: dn(s, d.sheet, e[s.sheet]),
						anchorRow: s.rowStart,
						anchorColumn: s.columnStart
					}, i.setEditingCell(d), r();
					return;
				}
				i.clearEditingCell(), t.setUserInput(d.sheet, d.row, d.column, d.text), t.setSelectedSheet(d.sheet), s || t.onArrowDown(), a.current && (a.current.value = ""), n();
				return;
			case "Shift": return;
			case "PageDown":
			case "PageUp":
				e.stopPropagation(), e.preventDefault();
				return;
			case "End":
			case "Home":
				d.mode = "edit", i.setEditingCell(d);
				return;
			case "F4": {
				let n = u.value, a = Array.from(n.slice(0, u.selectionStart)).length, o = Array.from(n.slice(0, u.selectionEnd)).length, [s, c, l] = t.cycleReference(n, a, o), f = Array.from(s), p = f.slice(0, c).join("").length, m = f.slice(0, l).join("").length;
				d.text = s, i.setEditingCell(d), setTimeout(() => {
					u.setSelectionRange(p, m);
				}, 0), e.stopPropagation(), e.preventDefault(), r();
				return;
			}
		}
	}, [
		t,
		n,
		r,
		i,
		a.current
	]) };
}, Mn = {
	fontWeight: "inherit",
	fontFamily: "inherit",
	fontSize: "inherit",
	position: "absolute",
	left: 0,
	top: 0,
	whiteSpace: "pre",
	width: "100%",
	padding: 0,
	lineHeight: "22px"
}, Nn = "var(--palette-primary-main)", Pn = (e) => {
	let { canEdit: t, model: n, onEditEnd: r, onTextUpdated: i, originalText: a, workbookState: o, type: s } = e, { t: c } = D(), [l, u] = T(a), [d, f] = T(a.length), [p, m] = T(null), [h, g] = T(0), [v, b] = T(!1), x = w(null), S = w(null), C = w(null);
	y(() => {
		u(a);
		let e = C.current;
		if (e && e.value !== a) {
			e.value = a;
			let t = o.getEditingCell(), n = t?.referencedRange?.str;
			if (t && n) {
				let r = t.cursorStart + n.length;
				e.setSelectionRange(r, r), f(r);
			} else f(a.length);
		}
	}, [a, o]);
	let { onKeyDown: E } = jn({
		model: n,
		onEditEnd: r,
		onTextUpdated: i,
		workbookState: o,
		textareaRef: C
	});
	y(() => {
		let e = o.getEditingCell();
		if (!e) return;
		let { editorWidth: t, editorHeight: n } = e;
		if (x.current) {
			let r = x.current.scrollWidth;
			r > t - 5 && (e.editorWidth = r + 10);
			let i = x.current.scrollHeight;
			i > n && (e.editorHeight = i);
		}
		s === e.focus && C.current?.focus({ preventScroll: !0 });
	});
	let O = _(() => {
		let e = C.current, t = o.getEditingCell();
		if (!e || !t) return;
		let r = e.value;
		t.text = r, t.referencedRange = null, t.cursorStart = e.selectionStart, t.cursorEnd = e.selectionEnd;
		let a = Cn(n, r);
		r === "" && s === "cell" && (t.mode = "accept"), o.setEditingCell(t), o.setActiveRanges(a.activeRanges), u(t.text), f(e.selectionStart), i();
	}, [
		o,
		n,
		i,
		s
	]), k = _(() => {
		let e = o.getEditingCell();
		s === e?.focus && (C.current && (C.current.value = ""), e && (n.setUserInput(e.sheet, e.row, e.column, o.getEditingText()), o.clearEditingCell()), r());
	}, [
		n,
		o,
		r,
		s
	]), A = o.getEditingCell(), j = A !== null || s === "formula-bar", M = A ? o.getEditingText() : a, N = t ? Cn(n, M, d).html : M, ee = n.getLanguage(), P = n.getLocale(), F = ee === "en" && P === "en", I = F && A !== null && A.focus === s && l.startsWith("=") && !v ? It(n, l, d) : null, te = F && I !== null;
	y(() => {
		g(0);
	}, [l, d]), y(() => {
		b(!1);
	}, [l]);
	let { menuRef: ne, position: re } = Qt(te, C), ie = (e = h) => {
		let t = C.current;
		if (!t || I?.kind !== "list") return;
		let n = Lt(t.value, t.selectionStart, I, e);
		t.value = n.text, t.setSelectionRange(n.cursor, n.cursor), O();
	}, L = (e) => {
		if (!I) return !1;
		if (e.key === "Escape") return b(!0), e.preventDefault(), e.stopPropagation(), !0;
		if (I.kind !== "list") return !1;
		if (e.key === "ArrowDown") g((e) => Math.min(e + 1, I.matches.length - 1));
		else if (e.key === "ArrowUp") g((e) => Math.max(e - 1, 0));
		else if (e.key === "Enter" || e.key === "Tab") ie();
		else return !1;
		return e.preventDefault(), e.stopPropagation(), !0;
	};
	return /* @__PURE__ */ K(W, { children: [
		/* @__PURE__ */ G(Jt, {
			open: p !== null,
			onClose: () => m(null),
			title: c("error_dialog.error_editing_formula"),
			message: p ?? void 0
		}),
		/* @__PURE__ */ K("div", {
			className: `ic-editor-container${j ? "" : " ic-editor-container--hidden"}${t ? "" : " ic-editor-container--readonly"}`,
			children: [/* @__PURE__ */ G("div", {
				ref: S,
				style: {
					...Mn,
					textAlign: "left",
					pointerEvents: "none",
					height: "100%"
				},
				children: /* @__PURE__ */ G("div", {
					style: { display: "inline-block" },
					ref: x,
					children: N
				})
			}), /* @__PURE__ */ G("textarea", {
				ref: C,
				rows: 1,
				style: {
					...Mn,
					color: "transparent",
					backgroundColor: "transparent",
					caretColor: Nn,
					outline: "none",
					resize: "none",
					border: "none",
					height: "100%",
					overflow: "hidden",
					alignContent: "baseline"
				},
				defaultValue: l,
				spellCheck: "false",
				onKeyDown: (e) => {
					if (!L(e)) try {
						E(e);
					} catch (e) {
						let t = o.getEditingCell();
						t && n.setSelectedSheet(t.sheet), o.clearEditingCell(), r(), m(String(e));
					}
				},
				disabled: !t,
				onChange: O,
				onBlur: k,
				onPointerDown: (e) => {
					if (!t) return;
					let n = o.getEditingCell();
					n && (n.mode = "edit", n.focus = s, o.setEditingCell(n), e.stopPropagation());
				},
				onScroll: () => {
					S.current && C.current && (S.current.style.left = `-${C.current.scrollLeft}px`, S.current.style.top = `-${C.current.scrollTop}px`);
				},
				onSelect: (e) => {
					f(e.currentTarget.selectionStart);
				},
				onPaste: (e) => e.stopPropagation(),
				onCopy: (e) => e.stopPropagation(),
				onDoubleClick: (e) => e.stopPropagation(),
				onCut: (e) => e.stopPropagation()
			})]
		}),
		te ? Wt(/* @__PURE__ */ G("div", {
			ref: ne,
			style: {
				position: "fixed",
				...re
			},
			children: /* @__PURE__ */ G(Bt, {
				completion: I,
				selected: h,
				onSelect: g,
				onAccept: ie
			})
		}), C.current) : null
	] });
}, Fn = (e) => {
	let { t } = D(), [n, r] = T(!1), i = w(null), a = w(null), o = w(null), [s, c] = T(), l = b(), u = e.model.getDefinedNameList(), d = _(() => {
		r(!0), e.onMenuOpenChange(!0);
	}, [e.onMenuOpenChange]), f = _(() => {
		r(!1), e.onMenuOpenChange(!1), a.current?.focus();
	}, [e.onMenuOpenChange]), p = _(() => {
		n ? f() : d();
	}, [
		f,
		n,
		d
	]);
	return y(() => {
		if (!n) return;
		function e(e) {
			i.current?.contains(e.target) || f();
		}
		function t(e) {
			e.key === "Escape" && f();
		}
		return document.addEventListener("pointerdown", e, !0), document.addEventListener("keydown", t, !0), () => {
			document.removeEventListener("pointerdown", e, !0), document.removeEventListener("keydown", t, !0);
		};
	}, [f, n]), S(() => {
		if (!n) return;
		function e() {
			let e = o.current;
			if (!e) return;
			let t = e.getBoundingClientRect().top;
			c(window.innerHeight - t - 8);
		}
		return e(), window.addEventListener("resize", e), () => {
			window.removeEventListener("resize", e);
		};
	}, [n]), /* @__PURE__ */ K("div", {
		className: "ic-formula-bar-menu",
		ref: i,
		children: [/* @__PURE__ */ G("div", {
			ref: a,
			className: "ic-formula-bar-menu-trigger",
			onClick: p,
			children: e.children
		}), n ? /* @__PURE__ */ K("div", {
			ref: o,
			id: l,
			className: "ic-formula-bar-menu-popover",
			role: "menu",
			style: { maxHeight: s },
			children: [u.length > 0 ? /* @__PURE__ */ K(W, { children: [u.map((t) => /* @__PURE__ */ K("button", {
				type: "button",
				className: "ic-formula-bar-menu-item",
				role: "menuitem",
				onClick: () => {
					let n = t.formula, r = wn(e.model, n);
					if (r) {
						let [t, n, i, a, o] = r;
						e.model.setSelectedSheet(t), e.model.setSelectedCell(n, i), e.model.setSelectedRange(n, i, a, o);
					}
					e.onUpdate(), f();
				},
				children: [
					/* @__PURE__ */ G($e, { className: "ic-formula-bar-menu-item-icon" }),
					/* @__PURE__ */ G("span", {
						className: "ic-formula-bar-menu-item-text",
						children: t.name
					}),
					/* @__PURE__ */ G("span", {
						className: "ic-formula-bar-menu-item-example",
						children: t.formula
					})
				]
			}, `${t.name}-${t.scope}`)), /* @__PURE__ */ G("div", { className: "ic-formula-bar-menu-divider" })] }) : null, /* @__PURE__ */ G("button", {
				type: "button",
				className: "ic-formula-bar-menu-item",
				role: "menuitem",
				disabled: !e.canEdit,
				onClick: () => {
					e.openDrawer(), f();
				},
				children: /* @__PURE__ */ G("span", {
					className: "ic-formula-bar-menu-item-text",
					children: t("formula_bar.manage_named_ranges")
				})
			})]
		}) : null]
	});
};
//#endregion
//#region src/components/FormulaBar/FormulaBar.tsx
function In(e) {
	let { cellAddress: t, formulaValue: n, model: r, onChange: i, onTextUpdated: a, workbookState: o } = e, [s, c] = T(!1);
	return /* @__PURE__ */ K("div", {
		className: "ic-formula-bar-root",
		children: [
			/* @__PURE__ */ G("div", {
				className: `${s ? "ic-formula-bar-address ic-formula-bar-address--active" : "ic-formula-bar-address"}`,
				children: /* @__PURE__ */ G(Fn, {
					onMenuOpenChange: (e) => {
						c(e);
					},
					openDrawer: e.openDrawer,
					canEdit: e.canEdit,
					model: r,
					onUpdate: i,
					children: /* @__PURE__ */ G(q, {
						variant: "ghost",
						size: "sm",
						pressed: s,
						endIcon: /* @__PURE__ */ G(R, {}),
						children: t
					})
				})
			}),
			/* @__PURE__ */ G("div", { className: "ic-formula-bar-divider" }),
			/* @__PURE__ */ K("div", {
				className: "ic-formula-bar-formula-container",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-formula-bar-button",
					children: /* @__PURE__ */ G(Tt, {})
				}), /* @__PURE__ */ G("div", {
					className: "ic-formula-bar-editor-wrapper",
					onPointerDown: (t) => {
						if (!e.canEdit) return;
						let [i, a, s] = r.getSelectedCell(), { width: c, height: l } = an(r, i, a, s);
						o.setEditingCell({
							sheet: i,
							row: a,
							column: s,
							text: n,
							referencedRange: null,
							cursorStart: n.length,
							cursorEnd: n.length,
							focus: "formula-bar",
							activeRanges: [],
							mode: "edit",
							editorWidth: c,
							editorHeight: l
						}), t.stopPropagation();
					},
					children: /* @__PURE__ */ G(Pn, {
						originalText: n,
						model: r,
						workbookState: o,
						onEditEnd: () => {
							i();
						},
						onTextUpdated: a,
						type: "formula-bar",
						canEdit: e.canEdit
					})
				})]
			})
		]
	});
}
//#endregion
//#region src/theme/theme.ts
var Ln = {
	"--typography-font-family": "Inter",
	"--typography-font-size": "12px",
	"--palette-common-black": "#272525",
	"--palette-common-white": "#FFF",
	"--palette-primary-main": "#F2994A",
	"--palette-primary-light": "#EFAA6D",
	"--palette-primary-dark": "#D68742",
	"--palette-primary-contrast-text": "#FFF",
	"--palette-secondary-main": "#2F80ED",
	"--palette-secondary-light": "#4E92EC",
	"--palette-secondary-dark": "#2B6EC8",
	"--palette-secondary-contrast-text": "#FFF",
	"--palette-error-main": "#EB5757",
	"--palette-error-light": "#E77A7A",
	"--palette-error-dark": "#CB4C4C",
	"--palette-error-contrast-text": "#FFF",
	"--palette-warning-main": "#F2C94C",
	"--palette-warning-light": "#EED384",
	"--palette-warning-dark": "#D6B244",
	"--palette-warning-contrast-text": "#FFF",
	"--palette-info-main": "#9E9E9E",
	"--palette-info-light": "#E0E0E0",
	"--palette-info-dark": "#757575",
	"--palette-info-contrast-text": "#FFF",
	"--palette-success-main": "#27AE60",
	"--palette-success-light": "#57BD82",
	"--palette-success-dark": "#239152",
	"--palette-success-contrast-text": "#FFF",
	"--palette-grey-50": "#F5F5F5",
	"--palette-grey-100": "#F2F2F2",
	"--palette-grey-200": "#EEEEEE",
	"--palette-grey-300": "#E0E0E0",
	"--palette-grey-400": "#BDBDBD",
	"--palette-grey-500": "#9E9E9E",
	"--palette-grey-600": "#757575",
	"--palette-grey-700": "#616161",
	"--palette-grey-800": "#424242",
	"--palette-grey-900": "#333333",
	"--palette-grey-a100": "#F2F2F2",
	"--palette-grey-a200": "#EEEEEE",
	"--palette-grey-a400": "#bdbdbd",
	"--palette-grey-a700": "#616161",
	"--palette-surface-elevated": "#FFF",
	"--palette-surface-elevated-border": "transparent",
	"--palette-input-background": "#FFF",
	"--palette-input-border": "#E0E0E0",
	"--palette-sheet-header-corner-background": "#FFF",
	"--palette-sheet-header-text-color": "#333",
	"--palette-sheet-header-background": "#FFF",
	"--palette-sheet-header-global-selector-color": "#EAECF4",
	"--palette-sheet-header-selected-background": "#EEEEEE",
	"--palette-sheet-header-full-selected-background": "#D3D6E9",
	"--palette-sheet-header-selected-color": "#333",
	"--palette-sheet-header-border-color": "#E0E0E0",
	"--palette-sheet-grid-color": "#E0E0E0",
	"--palette-sheet-grid-separator-color": "#E0E0E0",
	"--palette-sheet-default-text-color": "#2E414D",
	"--palette-sheet-outline-color": "#F2994A",
	"--palette-sheet-outline-editing-color": "#FBE0C9",
	"--palette-sheet-outline-background-color": "#F2994A1A",
	"--palette-sheet-default-cell-font-family": "Inter, \"Adjusted Arial Fallback\", sans-serif",
	"--palette-sheet-header-font": "bold 12px Inter, \"Adjusted Arial Fallback\", sans-serif"
}, Rn = {
	"--typography-font-family": "Inter",
	"--typography-font-size": "12px",
	"--palette-common-black": "#E8E6E3",
	"--palette-common-white": "#1E1E1E",
	"--palette-primary-main": "#F2994A",
	"--palette-primary-light": "#F5AD6E",
	"--palette-primary-dark": "#D68742",
	"--palette-primary-contrast-text": "#1E1E1E",
	"--palette-secondary-main": "#4E92EC",
	"--palette-secondary-light": "#6EA6F0",
	"--palette-secondary-dark": "#2B6EC8",
	"--palette-secondary-contrast-text": "#FFF",
	"--palette-error-main": "#EF6B6B",
	"--palette-error-light": "#F08A8A",
	"--palette-error-dark": "#CB4C4C",
	"--palette-error-contrast-text": "#1E1E1E",
	"--palette-warning-main": "#F2C94C",
	"--palette-warning-light": "#F5D879",
	"--palette-warning-dark": "#D6B244",
	"--palette-warning-contrast-text": "#1E1E1E",
	"--palette-info-main": "#ABABAB",
	"--palette-info-light": "#C2C2C2",
	"--palette-info-dark": "#757575",
	"--palette-info-contrast-text": "#1E1E1E",
	"--palette-success-main": "#3DBE76",
	"--palette-success-light": "#5FCB8E",
	"--palette-success-dark": "#239152",
	"--palette-success-contrast-text": "#1E1E1E",
	"--palette-grey-50": "#2A2A2A",
	"--palette-grey-100": "#2F2F2F",
	"--palette-grey-200": "#363636",
	"--palette-grey-300": "#444444",
	"--palette-grey-400": "#5E5E5E",
	"--palette-grey-500": "#7A7A7A",
	"--palette-grey-600": "#9E9E9E",
	"--palette-grey-700": "#B5B5B5",
	"--palette-grey-800": "#CFCFCF",
	"--palette-grey-900": "#EDEDED",
	"--palette-grey-a100": "#2F2F2F",
	"--palette-grey-a200": "#363636",
	"--palette-grey-a400": "#5E5E5E",
	"--palette-grey-a700": "#B5B5B5",
	"--palette-surface-elevated": "#2A2A2A",
	"--palette-surface-elevated-border": "#3A3A3A",
	"--palette-input-background": "#2A2A2A",
	"--palette-input-border": "#3A3A3A",
	"--palette-sheet-header-corner-background": "#242424",
	"--palette-sheet-header-text-color": "#D0D0D0",
	"--palette-sheet-header-background": "#242424",
	"--palette-sheet-header-global-selector-color": "#2C2F3A",
	"--palette-sheet-header-selected-background": "#333333",
	"--palette-sheet-header-full-selected-background": "#39405A",
	"--palette-sheet-header-selected-color": "#F0F0F0",
	"--palette-sheet-header-border-color": "#3A3A3A",
	"--palette-sheet-grid-color": "#3A3A3A",
	"--palette-sheet-grid-separator-color": "#3A3A3A",
	"--palette-sheet-default-text-color": "#E4E4E4",
	"--palette-sheet-outline-color": "#F2994A",
	"--palette-sheet-outline-editing-color": "#4A331C",
	"--palette-sheet-outline-background-color": "#F2994A26",
	"--palette-sheet-default-cell-font-family": "Inter, \"Adjusted Arial Fallback\", sans-serif",
	"--palette-sheet-header-font": "bold 12px Inter, \"Adjusted Arial Fallback\", sans-serif"
};
function zn(e, t = document.documentElement) {
	for (let [n, r] of Object.entries(e)) r == null ? t.style.removeProperty(n) : t.style.setProperty(n, r);
}
function Bn(e = document.documentElement) {
	for (let t of Object.keys(Ln)) e.style.removeProperty(t);
}
//#endregion
//#region src/components/ColorPicker/util.ts
function Vn(e) {
	return [
		e.lt1,
		e.dk1,
		e.lt2,
		e.dk2,
		e.accent1,
		e.accent2,
		e.accent3,
		e.accent4,
		e.accent5,
		e.accent6
	];
}
var Hn = [
	[
		-.05,
		-.15,
		-.25,
		-.35,
		-.5
	],
	[
		.5,
		.35,
		.25,
		.15,
		.05
	],
	[
		-.1,
		-.25,
		-.5,
		-.75,
		-.9
	],
	[
		.8,
		.6,
		.4,
		-.25,
		-.5
	],
	[
		.8,
		.6,
		.4,
		-.25,
		-.5
	],
	[
		.8,
		.6,
		.4,
		-.25,
		-.5
	],
	[
		.8,
		.6,
		.4,
		-.25,
		-.5
	],
	[
		.8,
		.6,
		.4,
		-.25,
		-.5
	],
	[
		.8,
		.6,
		.4,
		-.25,
		-.5
	],
	[
		.8,
		.6,
		.4,
		-.25,
		-.5
	]
];
function Un() {
	return Hn.map((e, t) => e.map((e) => [t, e]));
}
function Wn(e) {
	let t = Vn(e);
	return Un().map((e) => e.map(([e, n]) => ({
		hex: u(t[e], n),
		color: [e, n]
	})));
}
function X(e, t) {
	if (!e) return "";
	if (typeof e == "string") return e;
	let [n, r] = e, i = Vn(t);
	return u(i[n] ?? t.dk1, r);
}
var Gn = [
	"#800000",
	"#FF0000",
	"#FFA500",
	"#FFFF00",
	"#92d050",
	"#00b050",
	"#00b0f0",
	"#0070c0",
	"#002060",
	"#7030a0"
], Kn = (e) => {
	if (!e.startsWith("#")) return !1;
	let t = e.length === 4 ? `#${e[1]}${e[1]}${e[2]}${e[2]}${e[3]}${e[3]}` : e, n = parseInt(t.slice(1), 16), r = n >> 16 & 255, i = n >> 8 & 255, a = n & 255;
	return .2126 * r + .7152 * i + .0722 * a > 160;
}, qn = (e) => {
	let t = e.toUpperCase();
	return t === "#FFF" || t === "#FFFFFF";
}, Jn = (e) => Kn(e) ? "#272525" : "#FFFFFF", Yn = [
	{
		Icon: I,
		name: "ArrowUp"
	},
	{
		Icon: te,
		name: "ArrowAngleUp"
	},
	{
		Icon: F,
		name: "ArrowRight"
	},
	{
		Icon: N,
		name: "ArrowAngleDown"
	},
	{
		Icon: M,
		name: "ArrowDown"
	},
	{
		Icon: se,
		name: "TriangleUp"
	},
	{
		Icon: Oe,
		name: "FlatRectangle"
	},
	{
		Icon: R,
		name: "TriangleDown"
	},
	{
		Icon: L,
		name: "Check"
	},
	{
		Icon: le,
		name: "Exclamation"
	},
	{
		Icon: lt,
		name: "Cross"
	},
	{
		Icon: nt,
		name: "ThumbsUp"
	},
	{
		Icon: tt,
		name: "ThumbsDown"
	},
	{
		Icon: ce,
		name: "Circle",
		filled: !0
	},
	{
		Icon: fe,
		name: "Rhombus",
		filled: !0
	},
	{
		Icon: it,
		name: "Triangle",
		filled: !0
	},
	{
		Icon: U,
		name: "Flag",
		filled: !0
	},
	{
		Icon: Je,
		name: "Star",
		filled: !0
	},
	{
		Icon: be,
		name: "Heart",
		filled: !0
	}
];
function Xn(e) {
	return Yn.find((t) => t.name === e) || (console.warn(`Unknown icon name: ${e}`), {
		Icon: lt,
		filled: !1
	});
}
var Zn = ({ value: e, color: t, onChange: n }) => {
	let [r, i] = T(!1), a = w(null), o = w(null), [s, c] = T({
		top: -9999,
		left: -9999
	}), l = Xn(e);
	return S(() => {
		if (!r || !a.current || !o.current) return;
		let e = a.current.getBoundingClientRect(), t = o.current, n = t.offsetWidth, i = t.offsetHeight, s = window.innerWidth, l = window.innerHeight, u = e.left, d = e.bottom + 4;
		u + n > s - 8 && (u = s - n - 8), d + i > l - 8 && (d = e.top - i - 4), c({
			top: d,
			left: u
		});
	}, [r]), y(() => {
		if (!r) return;
		let e = (e) => {
			!a.current?.contains(e.target) && !o.current?.contains(e.target) && i(!1);
		};
		return document.addEventListener("mousedown", e), () => document.removeEventListener("mousedown", e);
	}, [r]), /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G("button", {
		ref: a,
		type: "button",
		className: "ic-icon-picker-trigger",
		"aria-label": "Pick icon",
		onClick: () => i((e) => !e),
		children: /* @__PURE__ */ G(l.Icon, {
			size: 16,
			color: t,
			fill: l.filled ? t : "none"
		})
	}), r && Wt(/* @__PURE__ */ G("div", {
		ref: o,
		className: "ic-icon-picker-panel",
		style: {
			top: s.top,
			left: s.left
		},
		children: Yn.map(({ Icon: r, name: a, filled: o }) => /* @__PURE__ */ G("button", {
			type: "button",
			className: `ic-icon-picker-item${a === e ? " ic-icon-picker-item--selected" : ""}`,
			"aria-label": a,
			onClick: () => {
				n(a), i(!1);
			},
			children: /* @__PURE__ */ G(r, {
				size: 16,
				color: t,
				fill: o ? t : "none"
			})
		}, a))
	}), a.current)] });
};
//#endregion
//#region src/components/Select/Select.tsx
function Qn(e, t) {
	let n = e.getBoundingClientRect(), r = Math.max(t.offsetWidth, n.width), i = t.offsetHeight, a = window.innerWidth, o = window.innerHeight, s = o - n.bottom - 8, c = n.top - 8, l = s >= i + 4 || s >= c, u = n.left, d = u + r > a - 8 ? n.right - r : u, f = l ? n.bottom + 4 : n.top - i - 4;
	return d + r > a - 8 && (d = a - r - 8), d < 8 && (d = 8), f + i > o - 8 && (f = o - i - 8), f < 8 && (f = 8), {
		top: f,
		left: d,
		minWidth: n.width
	};
}
function $n({ value: e, options: t, onChange: n, id: r, name: i, size: a = "md", variant: o = "default", label: s, helperText: c, error: l = !1, required: u, disabled: d = !1, className: f, hideCheck: p = !1 }) {
	let m = b(), h = r ?? m, g = `${h}-helper`, _ = `${h}-label`, v = `${h}-value`, x = `${h}-listbox`, E = w(null), D = w(null), O = w(null), k = w([]), A = t.findIndex((t) => t.value === e), j = t[A], [M, N] = T(!1), [ee, P] = T(A), [F, I] = T({});
	y(() => {
		M || P(Math.max(0, A));
	}, [M, A]), y(() => {
		function e(e) {
			let t = e.target, n = E.current, r = O.current;
			t && n && (n.contains(t) || r && r.contains(t) || N(!1));
		}
		return document.addEventListener("pointerdown", e), () => {
			document.removeEventListener("pointerdown", e);
		};
	}, []), y(() => {
		M && k.current[ee]?.focus();
	}, [M, ee]), S(() => {
		if (!M) return;
		function e() {
			let e = D.current, t = O.current;
			if (!e || !t) return;
			let { top: n, left: r, minWidth: i } = Qn(e, t);
			I({
				top: n,
				left: r,
				minWidth: i
			});
		}
		return e(), window.addEventListener("resize", e), window.addEventListener("scroll", e, !0), () => {
			window.removeEventListener("resize", e), window.removeEventListener("scroll", e, !0);
		};
	}, [M]);
	let te = C(() => [
		"ic-select-control",
		a,
		o !== "default" && `variant-${o}`,
		M && "is-open",
		l && "is-error",
		d && "disabled"
	].filter(Boolean).join(" "), [
		d,
		l,
		M,
		a,
		o
	]);
	function ne() {
		N(!1), D.current?.focus();
	}
	function re() {
		d || t.length === 0 || N((e) => !e);
	}
	function ie(e) {
		let r = t[e];
		r && (n(r.value), N(!1), D.current?.focus());
	}
	function ae(e) {
		if (!(d || t.length === 0 || M)) switch (e.key) {
			case "ArrowDown":
			case "ArrowUp":
			case "Enter":
			case " ": e.preventDefault(), P(Math.max(0, A)), N(!0);
		}
	}
	function oe(e, n) {
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault(), P((n + 1) % t.length);
				break;
			case "ArrowUp":
				e.preventDefault(), P((n - 1 + t.length) % t.length);
				break;
			case "Home":
				e.preventDefault(), P(0);
				break;
			case "End":
				e.preventDefault(), P(t.length - 1);
				break;
			case "Enter":
			case " ":
				e.preventDefault(), ie(n);
				break;
			case "Escape": e.preventDefault(), ne();
		}
	}
	return /* @__PURE__ */ K("div", {
		ref: E,
		className: ["ic-select", f].filter(Boolean).join(" "),
		children: [
			s && /* @__PURE__ */ G("label", {
				id: _,
				htmlFor: h,
				"data-required": u || void 0,
				children: s
			}),
			/* @__PURE__ */ K("div", {
				className: te,
				children: [
					i ? /* @__PURE__ */ G("input", {
						type: "hidden",
						name: i,
						value: e
					}) : null,
					/* @__PURE__ */ K("button", {
						ref: D,
						id: h,
						type: "button",
						className: "ic-select-trigger",
						role: "combobox",
						"aria-haspopup": "listbox",
						"aria-expanded": M ? "true" : "false",
						"aria-controls": x,
						"aria-labelledby": s ? `${_} ${v}` : void 0,
						"aria-required": u || void 0,
						"aria-invalid": l || void 0,
						"aria-describedby": c ? g : void 0,
						disabled: d,
						onClick: re,
						onKeyDown: ae,
						children: [/* @__PURE__ */ G("span", {
							id: v,
							className: "ic-select-trigger-value",
							children: j?.triggerLabel ?? j?.label
						}), /* @__PURE__ */ G("span", {
							className: "ic-select-trigger-icon",
							"aria-hidden": "true",
							children: G(M ? se : R, { size: 16 })
						})]
					}),
					M ? Wt(/* @__PURE__ */ G("div", {
						ref: O,
						className: "ic-dropdown-menu-wrapper",
						style: F,
						children: /* @__PURE__ */ G("div", {
							id: x,
							className: "ic-dropdown-menu",
							role: "listbox",
							"aria-labelledby": s ? _ : v,
							children: t.map((t, n) => {
								let r = t.value === e;
								return /* @__PURE__ */ K("button", {
									ref: (e) => {
										k.current[n] = e;
									},
									type: "button",
									role: "option",
									"aria-selected": r ? "true" : "false",
									className: [
										"ic-dropdown-menu-option",
										r && "is-selected",
										n === ee && "is-active"
									].filter(Boolean).join(" "),
									onClick: () => ie(n),
									onMouseEnter: () => P(n),
									onKeyDown: (e) => oe(e, n),
									children: [!p && /* @__PURE__ */ G("span", {
										className: "ic-dropdown-menu-option-check",
										"aria-hidden": "true",
										children: r ? /* @__PURE__ */ G(L, { size: 16 }) : null
									}), /* @__PURE__ */ G("span", {
										className: "ic-dropdown-menu-option-content",
										children: t.label
									})]
								}, t.value);
							})
						})
					}), E.current) : null
				]
			}),
			c && /* @__PURE__ */ G("p", {
				id: g,
				children: c
			})
		]
	});
}
$n.displayName = "Select";
//#endregion
//#region src/components/Tooltip/useTooltipPosition.ts
function er(e, t) {
	let n = e.getBoundingClientRect(), r = t.offsetWidth, i = t.offsetHeight, a = window.innerWidth, o = n.left + n.width / 2 - r / 2, s = n.top - i - 6;
	return s < 8 && (s = n.bottom + 6), o + r > a - 8 && (o = a - r - 8), o < 8 && (o = 8), {
		top: s,
		left: o
	};
}
function tr(e) {
	let t = w(null), n = w(null), [r, i] = T({});
	return S(() => {
		if (!e) return;
		function r() {
			let e = t.current, r = n.current;
			if (!e || !r) return;
			let { top: a, left: o } = er(e, r);
			i({
				top: a,
				left: o
			});
		}
		return r(), window.addEventListener("resize", r), window.addEventListener("scroll", r, !0), () => {
			window.removeEventListener("resize", r), window.removeEventListener("scroll", r, !0);
		};
	}, [e]), {
		triggerRef: t,
		tooltipRef: n,
		position: r
	};
}
//#endregion
//#region src/components/Tooltip/Tooltip.tsx
function Z({ title: e, children: t }) {
	let n = b(), [r, i] = T(!1), { triggerRef: a, tooltipRef: o, position: s } = tr(r);
	function c() {
		return !!a.current?.querySelector("[aria-expanded=\"true\"]");
	}
	return /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G("span", {
		ref: a,
		role: "none",
		className: "ic-tooltip-trigger",
		"aria-describedby": r ? n : void 0,
		onPointerEnter: (e) => {
			e.pointerType === "mouse" && !c() && i(!0);
		},
		onPointerLeave: () => i(!1),
		onPointerDown: () => i(!1),
		onFocus: () => {
			c() || i(!0);
		},
		onBlur: () => i(!1),
		children: t
	}), Wt(/* @__PURE__ */ G("div", {
		ref: o,
		id: n,
		role: "tooltip",
		className: "ic-tooltip",
		"data-visible": r,
		style: s,
		children: e
	}), a.current)] });
}
Z.displayName = "Tooltip";
//#endregion
//#region node_modules/react-colorful/dist/index.mjs
function nr() {
	return (nr = Object.assign || function(e) {
		for (var t = 1; t < arguments.length; t++) {
			var n = arguments[t];
			for (var r in n) Object.prototype.hasOwnProperty.call(n, r) && (e[r] = n[r]);
		}
		return e;
	}).apply(this, arguments);
}
function rr(e, t) {
	if (e == null) return {};
	var n, r, i = {}, a = Object.keys(e);
	for (r = 0; r < a.length; r++) t.indexOf(n = a[r]) >= 0 || (i[n] = e[n]);
	return i;
}
function ir(e) {
	var t = w(e), n = w(function(e) {
		t.current && t.current(e);
	});
	return t.current = e, n.current;
}
var ar = function(e, t, n) {
	return t === void 0 && (t = 0), n === void 0 && (n = 1), e > n ? n : e < t ? t : e;
}, or = function(e) {
	return "touches" in e;
}, sr = function(e) {
	return e && e.ownerDocument.defaultView || self;
}, cr = function(e, t, n) {
	var r = e.getBoundingClientRect(), i = or(t) ? function(e, t) {
		for (var n = 0; n < e.length; n++) if (e[n].identifier === t) return e[n];
		return e[0];
	}(t.touches, n) : t;
	return {
		left: ar((i.pageX - (r.left + sr(e).pageXOffset)) / r.width),
		top: ar((i.pageY - (r.top + sr(e).pageYOffset)) / r.height)
	};
}, lr = function(e) {
	!or(e) && e.preventDefault();
}, ur = f.memo(function(e) {
	var t = e.onMove, n = e.onKey, r = e.onEnd, i = rr(e, [
		"onMove",
		"onKey",
		"onEnd"
	]), a = w(null), o = ir(t), s = ir(n), c = ir(r), l = w(null), u = w(!1), d = C(function() {
		var e = function(e) {
			lr(e), (or(e) ? e.touches.length > 0 : e.buttons > 0) && a.current ? o(cr(a.current, e, l.current)) : (n(!1), c());
		}, t = function() {
			n(!1), c();
		};
		function n(n) {
			var r = u.current, i = sr(a.current), o = n ? i.addEventListener : i.removeEventListener;
			o(r ? "touchmove" : "mousemove", e), o(r ? "touchend" : "mouseup", t);
		}
		return [
			function(e) {
				var t = e.nativeEvent, r = a.current;
				if (r && (lr(t), !function(e, t) {
					return t && !or(e);
				}(t, u.current) && r)) {
					if (or(t)) {
						u.current = !0;
						var i = t.changedTouches || [];
						i.length && (l.current = i[0].identifier);
					}
					r.focus(), o(cr(r, t, l.current)), n(!0);
				}
			},
			function(e) {
				var t = e.which || e.keyCode;
				t < 37 || t > 40 || (e.preventDefault(), s({
					left: t === 39 ? .05 : t === 37 ? -.05 : 0,
					top: t === 40 ? .05 : t === 38 ? -.05 : 0
				}));
			},
			function(e) {
				var t = e.which || e.keyCode;
				t >= 37 && t <= 40 && c();
			},
			n
		];
	}, [
		s,
		o,
		c
	]), p = d[0], m = d[1], h = d[2], g = d[3];
	return y(function() {
		return g;
	}, [g]), f.createElement("div", nr({}, i, {
		onTouchStart: p,
		onMouseDown: p,
		className: "react-colorful__interactive",
		ref: a,
		onKeyDown: m,
		onKeyUp: h,
		tabIndex: 0,
		role: "slider"
	}));
}), dr = function(e) {
	return e.filter(Boolean).join(" ");
}, fr = function(e) {
	var t = e.color, n = e.left, r = e.top, i = r === void 0 ? .5 : r, a = dr(["react-colorful__pointer", e.className]);
	return f.createElement("div", {
		className: a,
		style: {
			top: 100 * i + "%",
			left: 100 * n + "%"
		}
	}, f.createElement("div", {
		className: "react-colorful__pointer-fill",
		style: { backgroundColor: t }
	}));
}, pr = function(e, t, n) {
	return t === void 0 && (t = 0), n === void 0 && (n = 10 ** t), Math.round(n * e) / n;
}, mr = function(e) {
	return Sr(hr(e));
}, hr = function(e) {
	return e[0] === "#" && (e = e.substring(1)), e.length < 6 ? {
		r: parseInt(e[0] + e[0], 16),
		g: parseInt(e[1] + e[1], 16),
		b: parseInt(e[2] + e[2], 16),
		a: e.length === 4 ? pr(parseInt(e[3] + e[3], 16) / 255, 2) : 1
	} : {
		r: parseInt(e.substring(0, 2), 16),
		g: parseInt(e.substring(2, 4), 16),
		b: parseInt(e.substring(4, 6), 16),
		a: e.length === 8 ? pr(parseInt(e.substring(6, 8), 16) / 255, 2) : 1
	};
}, gr = function(e) {
	return xr(yr(e));
}, _r = function(e) {
	var t = e.s, n = e.v, r = e.a, i = (200 - t) * n / 100;
	return {
		h: pr(e.h),
		s: pr(i > 0 && i < 200 ? t * n / 100 / (i <= 100 ? i : 200 - i) * 100 : 0),
		l: pr(i / 2),
		a: pr(r, 2)
	};
}, vr = function(e) {
	var t = _r(e);
	return "hsl(" + t.h + ", " + t.s + "%, " + t.l + "%)";
}, yr = function(e) {
	var t = e.h, n = e.s, r = e.v, i = e.a;
	t = t / 360 * 6, n /= 100, r /= 100;
	var a = Math.floor(t), o = r * (1 - n), s = r * (1 - (t - a) * n), c = r * (1 - (1 - t + a) * n), l = a % 6;
	return {
		r: pr(255 * [
			r,
			s,
			o,
			o,
			c,
			r
		][l]),
		g: pr(255 * [
			c,
			r,
			r,
			s,
			o,
			o
		][l]),
		b: pr(255 * [
			o,
			o,
			c,
			r,
			r,
			s
		][l]),
		a: pr(i, 2)
	};
}, br = function(e) {
	var t = e.toString(16);
	return t.length < 2 ? "0" + t : t;
}, xr = function(e) {
	var t = e.r, n = e.g, r = e.b, i = e.a, a = i < 1 ? br(pr(255 * i)) : "";
	return "#" + br(t) + br(n) + br(r) + a;
}, Sr = function(e) {
	var t = e.r, n = e.g, r = e.b, i = e.a, a = Math.max(t, n, r), o = a - Math.min(t, n, r), s = o ? a === t ? (n - r) / o : a === n ? 2 + (r - t) / o : 4 + (t - n) / o : 0;
	return {
		h: 60 * (s < 0 ? s + 6 : s),
		s: a ? o / a * 100 : 0,
		v: a / 255 * 100,
		a: i
	};
}, Cr = f.memo(function(e) {
	var t = e.hue, n = e.onChange, r = e.onChangeEnd, i = dr(["react-colorful__hue", e.className]);
	return f.createElement("div", { className: i }, f.createElement(ur, {
		onMove: function(e) {
			n({ h: 360 * e.left });
		},
		onKey: function(e) {
			n({ h: ar(t + 360 * e.left, 0, 360) });
		},
		onEnd: r,
		"aria-label": "Hue",
		"aria-valuenow": pr(t),
		"aria-valuemax": "360",
		"aria-valuemin": "0"
	}, f.createElement(fr, {
		className: "react-colorful__hue-pointer",
		left: t / 360,
		color: vr({
			h: t,
			s: 100,
			v: 100,
			a: 1
		})
	})));
}), wr = f.memo(function(e) {
	var t = e.hsva, n = e.onChange, r = e.onChangeEnd, i = { backgroundColor: vr({
		h: t.h,
		s: 100,
		v: 100,
		a: 1
	}) };
	return f.createElement("div", {
		className: "react-colorful__saturation",
		style: i
	}, f.createElement(ur, {
		onMove: function(e) {
			n({
				s: 100 * e.left,
				v: 100 - 100 * e.top
			});
		},
		onKey: function(e) {
			n({
				s: ar(t.s + 100 * e.left, 0, 100),
				v: ar(t.v - 100 * e.top, 0, 100)
			});
		},
		onEnd: r,
		"aria-label": "Color",
		"aria-valuetext": "Saturation " + pr(t.s) + "%, Brightness " + pr(t.v) + "%"
	}, f.createElement(fr, {
		className: "react-colorful__saturation-pointer",
		top: 1 - t.v / 100,
		left: t.s / 100,
		color: vr(t)
	})));
}), Tr = function(e, t) {
	if (e === t) return !0;
	for (var n in e) if (e[n] !== t[n]) return !1;
	return !0;
}, Er = function(e, t) {
	return e.toLowerCase() === t.toLowerCase() || Tr(hr(e), hr(t));
};
function Dr(e, t, n, r) {
	var i = ir(n), a = ir(r), o = T(function() {
		return e.toHsva(t);
	}), s = o[0], c = o[1], l = w({
		color: t,
		hsva: s
	}), u = w(!1);
	return y(function() {
		if (!e.equal(t, l.current.color)) {
			var n = e.toHsva(t);
			l.current = {
				hsva: n,
				color: t
			}, c(n), u.current = !1;
		}
	}, [t, e]), y(function() {
		var t;
		Tr(s, l.current.hsva) || e.equal(t = e.fromHsva(s), l.current.color) || (l.current = {
			hsva: s,
			color: t
		}, i(t), u.current = !0);
	}, [
		s,
		e,
		i
	]), [
		s,
		_(function(e) {
			c(function(t) {
				return Object.assign({}, t, e);
			});
		}, []),
		_(function() {
			u.current && (u.current = !1, a(l.current.color));
		}, [a])
	];
}
var Or = typeof window < "u" ? S : y, kr = function() {
	return typeof __webpack_nonce__ < "u" ? __webpack_nonce__ : void 0;
}, Ar = /* @__PURE__ */ new WeakMap(), jr = function(e) {
	Or(function() {
		var t = e.current;
		if (typeof document < "u" && t) {
			var n = t.getRootNode ? t.getRootNode() : t.ownerDocument, r = n && ("head" in n || "host" in n) ? n : t.ownerDocument;
			if (!Ar.has(r)) {
				var i = "head" in r ? r.head : r, a = (i.ownerDocument || document).createElement("style");
				a.innerHTML = ".react-colorful{position:relative;display:flex;flex-direction:column;width:200px;height:200px;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;cursor:default}.react-colorful__saturation{position:relative;flex-grow:1;border-color:transparent;border-bottom:12px solid #000;border-radius:8px 8px 0 0;background-image:linear-gradient(0deg,#000,transparent),linear-gradient(90deg,#fff,hsla(0,0%,100%,0))}.react-colorful__alpha-gradient,.react-colorful__pointer-fill{content:\"\";position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;border-radius:inherit}.react-colorful__alpha-gradient,.react-colorful__saturation{box-shadow:inset 0 0 0 1px rgba(0,0,0,.05)}.react-colorful__alpha,.react-colorful__hue{position:relative;height:24px}.react-colorful__hue{background:linear-gradient(90deg,red 0,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,red)}.react-colorful__last-control{border-radius:0 0 8px 8px}.react-colorful__interactive{position:absolute;left:0;top:0;right:0;bottom:0;border-radius:inherit;outline:none;touch-action:none}.react-colorful__pointer{position:absolute;z-index:1;box-sizing:border-box;width:28px;height:28px;transform:translate(-50%,-50%);background-color:#fff;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.2)}.react-colorful__interactive:focus .react-colorful__pointer{transform:translate(-50%,-50%) scale(1.1)}.react-colorful__alpha,.react-colorful__alpha-pointer{background-color:#fff;background-image:url('data:image/svg+xml;charset=utf-8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" fill-opacity=\".05\"><path d=\"M8 0h8v8H8zM0 8h8v8H0z\"/></svg>')}.react-colorful__saturation-pointer{z-index:3}.react-colorful__hue-pointer{z-index:2}";
				var o = kr();
				o && a.setAttribute("nonce", o), Ar.set(r, a), i.appendChild(a);
			}
		}
	}, []);
}, Mr = function(e) {
	var t = e.className, n = e.colorModel, r = e.color, i = r === void 0 ? n.defaultColor : r, a = e.onChange, o = e.onChangeEnd, s = rr(e, [
		"className",
		"colorModel",
		"color",
		"onChange",
		"onChangeEnd"
	]), c = w(null);
	jr(c);
	var l = Dr(n, i, a, o), u = l[0], d = l[1], p = l[2], m = dr(["react-colorful", t]);
	return f.createElement("div", nr({}, s, {
		ref: c,
		className: m
	}), f.createElement(wr, {
		hsva: u,
		onChange: d,
		onChangeEnd: p
	}), f.createElement(Cr, {
		hue: u.h,
		onChange: d,
		onChangeEnd: p,
		className: "react-colorful__last-control"
	}));
}, Nr = {
	defaultColor: "000",
	toHsva: mr,
	fromHsva: function(e) {
		return gr({
			h: e.h,
			s: e.s,
			v: e.v,
			a: 1
		});
	},
	equal: Er
}, Pr = function(e) {
	return f.createElement(Mr, nr({}, e, { colorModel: Nr }));
}, Fr = /^#?([0-9A-F]{3,8})$/i, Ir = function(e) {
	var t = e.color, n = t === void 0 ? "" : t, r = e.onChange, i = e.onBlur, a = e.escape, o = e.validate, s = e.format, c = e.process, l = rr(e, [
		"color",
		"onChange",
		"onBlur",
		"escape",
		"validate",
		"format",
		"process"
	]), u = T(function() {
		return a(n);
	}), d = u[0], p = u[1], m = ir(r), h = ir(i), g = _(function(e) {
		var t = a(e.target.value);
		p(t), o(t) && m(c ? c(t) : t);
	}, [
		a,
		c,
		o,
		m
	]), v = _(function(e) {
		o(e.target.value) || p(a(n)), h(e);
	}, [
		n,
		a,
		o,
		h
	]);
	return y(function() {
		p(a(n));
	}, [n, a]), f.createElement("input", nr({}, l, {
		value: s ? s(d) : d,
		spellCheck: "false",
		onChange: g,
		onBlur: v
	}));
}, Lr = function(e) {
	return "#" + e;
}, Rr = function(e) {
	var t = e.prefixed, n = e.alpha, r = rr(e, ["prefixed", "alpha"]), i = _(function(e) {
		return e.replace(/([^0-9A-F]+)/gi, "").substring(0, n ? 8 : 6);
	}, [n]), a = _(function(e) {
		return function(e, t) {
			var n = Fr.exec(e), r = n ? n[1].length : 0;
			return r === 3 || r === 6 || !!t && r === 4 || !!t && r === 8;
		}(e, n);
	}, [n]);
	return f.createElement(Ir, nr({}, r, {
		escape: i,
		format: t ? Lr : void 0,
		process: Lr,
		validate: a
	}));
}, zr = (e) => {
	let { onEscape: t, getFocusableElements: n } = e;
	return { onKeyDown: _((e) => {
		if (e.key === "Escape") {
			e.preventDefault(), t();
			return;
		}
		if (e.key !== "Tab") return;
		let r = n();
		if (r.length === 0) return;
		let i = r[0], a = r[r.length - 1], o = document.activeElement;
		!e.shiftKey && o === a && (e.preventDefault(), i.focus()), e.shiftKey && o === i && (e.preventDefault(), a.focus());
	}, [n, t]) };
}, Br = 14, Vr = ({ color: e, onAccept: t, onCancel: n, anchorEl: r, open: i }) => {
	let [a, o] = T(e), [s, c] = T({
		top: 0,
		left: 0
	}), l = w([]), u = w(null), d = b(), { t: f } = D();
	y(() => {
		o(e);
	}, [e]), y(() => {
		i && u.current?.querySelector("input, button")?.focus();
	}, [i]), S(() => {
		if (!i || !r.current) return;
		let e = () => {
			let e = r.current, t = u.current;
			if (!e || !t) return;
			let n = e.getBoundingClientRect(), i = t.offsetWidth, a = t.offsetHeight, o = window.innerWidth, s = window.innerHeight, l = n.left - 4, d = n.bottom + 4;
			l + i > o - 8 && (l = o - i - 8), l < 8 && (l = 8), d + a > s - 8 && (d = n.top - a - 4), d < 8 && (d = 8), c({
				top: d,
				left: l
			});
		};
		return e(), window.addEventListener("resize", e), window.addEventListener("scroll", e, !0), () => {
			window.removeEventListener("resize", e), window.removeEventListener("scroll", e, !0);
		};
	}, [i, r]);
	let { onKeyDown: p } = zr({
		onEscape: n,
		getFocusableElements: () => pn(u.current)
	}), m = (e) => {
		l.current.includes(e) || (l.current = [e, ...l.current].slice(0, Br)), o(e), t(e);
	}, h = a.toUpperCase() === "#FFFFFF";
	return i ? Wt(/* @__PURE__ */ K("div", {
		className: "ic-menu-layer",
		children: [/* @__PURE__ */ G("div", {
			className: "ic-menu-backdrop",
			onClick: n,
			"aria-hidden": "true"
		}), /* @__PURE__ */ G("div", {
			ref: u,
			className: "ic-advanced-color-picker-panel",
			style: {
				top: `${s.top}px`,
				left: `${s.left}px`
			},
			role: "dialog",
			"aria-modal": "true",
			"aria-label": f("color_picker.title"),
			onKeyDown: p,
			children: /* @__PURE__ */ K("div", {
				className: "ic-advanced-color-picker",
				onClick: (e) => {
					e.stopPropagation();
				},
				children: [
					/* @__PURE__ */ G(Pr, {
						color: a,
						onChange: (e) => {
							o(e);
						}
					}),
					/* @__PURE__ */ G("div", { className: "ic-advanced-color-picker-divider" }),
					/* @__PURE__ */ K("div", {
						className: "ic-advanced-color-picker-input-row",
						children: [/* @__PURE__ */ K("div", {
							className: "ic-advanced-color-picker-hex-wrapper",
							children: [/* @__PURE__ */ G("label", {
								className: "ic-advanced-color-picker-hex-label",
								htmlFor: d,
								children: "Hex"
							}), /* @__PURE__ */ K("div", {
								className: "ic-advanced-color-picker-hex-input-box",
								children: [/* @__PURE__ */ G("div", {
									className: "ic-advanced-color-picker-hash-label",
									children: "#"
								}), /* @__PURE__ */ G(Rr, {
									id: d,
									className: "ic-advanced-color-picker-hex-input",
									color: a,
									onChange: (e) => {
										o(e);
									}
								})]
							})]
						}), /* @__PURE__ */ G("div", {
							className: ["ic-advanced-color-picker-swatch", h ? "ic-advanced-color-picker-swatch--white" : ""].filter(Boolean).join(" "),
							style: { backgroundColor: a },
							"aria-hidden": "true"
						})]
					}),
					/* @__PURE__ */ G("div", { className: "ic-advanced-color-picker-divider" }),
					/* @__PURE__ */ K("div", {
						className: "ic-advanced-color-picker-buttons",
						children: [/* @__PURE__ */ G(q, {
							size: "sm",
							variant: "secondary",
							onClick: n,
							children: f("color_picker.cancel")
						}), /* @__PURE__ */ G(q, {
							size: "sm",
							startIcon: /* @__PURE__ */ G(L, {}),
							onClick: () => {
								m(a), n();
							},
							children: f("color_picker.apply")
						})]
					})
				]
			})
		})]
	}), r.current) : null;
};
//#endregion
//#region src/components/ColorPicker/useAnchorPosition.ts
function Hr(e, t, n) {
	let r = e.getBoundingClientRect(), i = t.offsetWidth, a = t.offsetHeight, o = window.innerWidth, s = window.innerHeight, c, l;
	if (n === "right") c = r.right, l = r.top;
	else {
		let e = s - r.bottom - 8, t = r.top - 8, u = n === "top" ? t < a + 4 && e > t : e >= a + 4 || e >= t, d = r.left;
		c = d + i > o - 8 ? r.right - i : d, l = u ? r.bottom + 4 : r.top - a - 4;
	}
	return c + i > o - 8 && (c = o - i - 8), c < 8 && (c = 8), l + a > s - 8 && (l = s - a - 8), l < 8 && (l = 8), {
		top: l,
		left: c
	};
}
function Ur(e, t, n = "bottom") {
	let r = w(null), [i, a] = T({});
	return S(() => {
		if (!e) return;
		function i() {
			let e = t.current, i = r.current;
			if (!e || !i) return;
			let { top: o, left: s } = Hr(e, i, n);
			a({
				top: o,
				left: s
			});
		}
		return i(), window.addEventListener("resize", i), window.addEventListener("scroll", i, !0), () => {
			window.removeEventListener("resize", i), window.removeEventListener("scroll", i, !0);
		};
	}, [
		e,
		t,
		n
	]), {
		panelRef: r,
		position: i
	};
}
//#endregion
//#region src/components/ColorPicker/useKeyDown.ts
function Wr(e) {
	let t = Number(e.dataset.navRow), n = Number(e.dataset.navCol);
	return Number.isNaN(t) || Number.isNaN(n) ? null : {
		row: t,
		col: n
	};
}
function Gr(e, t) {
	return e.filter((e) => Wr(e)?.row === t);
}
function Kr(e, t) {
	let n = Gr(e, t);
	return n.length === 0 ? null : Math.max(...n.map((e) => Wr(e)?.col).filter((e) => e !== void 0));
}
var qr = (e) => {
	let { onEscape: t, getFocusableElements: n } = e;
	return { onKeyDown: _((e) => {
		let { key: r, shiftKey: i } = e, a = n();
		if (a.length === 0) return;
		let o = document.activeElement, s = o ? a.indexOf(o) : -1;
		if (r === "Escape") {
			e.preventDefault(), t();
			return;
		}
		if (r === "Tab") {
			if (e.preventDefault(), s === -1) {
				a[0]?.focus();
				return;
			}
			a[i ? (s - 1 + a.length) % a.length : (s + 1) % a.length]?.focus();
			return;
		}
		if (r !== "ArrowLeft" && r !== "ArrowRight" && r !== "ArrowUp" && r !== "ArrowDown" || !o) return;
		let c = Wr(o);
		if (!c) return;
		let l = c.row, u = c.col;
		r === "ArrowLeft" ? --u : r === "ArrowRight" ? u += 1 : r === "ArrowUp" ? --l : r === "ArrowDown" && (l += 1);
		let d = a.find((e) => {
			let t = Wr(e);
			return t?.row === l && t?.col === u;
		});
		if (!d && r === "ArrowLeft") {
			let e = c.row - 1, t = Kr(a, e);
			t !== null && (d = a.find((n) => {
				let r = Wr(n);
				return r?.row === e && r?.col === t;
			}));
		}
		if (!d && r === "ArrowRight") {
			let e = c.row + 1;
			d = a.find((t) => {
				let n = Wr(t);
				return n?.row === e && n?.col === 0;
			});
		}
		!d && (r === "ArrowUp" || r === "ArrowDown") && (d = a.find((e) => {
			let t = Wr(e);
			return t?.row === l && t?.col === c.col;
		})), d && (e.preventDefault(), d.focus());
	}, [n, t]) };
}, Jr = "#272525", Yr = 29;
function Xr(e, t) {
	return e === void 0 || t === void 0 ? e === t : Array.isArray(e) && Array.isArray(t) ? e[0] === t[0] && e[1] === t[1] : typeof e == "string" && typeof t == "string" && e.toUpperCase() === t.toUpperCase();
}
var Zr = ({ color: e, defaultColor: t, defaultSwatchColor: n = t, title: r, onChange: i, onClose: a, anchorEl: o, open: s, placement: c = "bottom", theme: l }) => {
	let [u, d] = T(e), [f, p] = T(!1), { panelRef: m, position: h } = Ur(s && !f, o, c), g = w([]), { t: _ } = D(), v = Vn(l), b = Wn(l);
	y(() => {
		d(e);
	}, [e]);
	let { onKeyDown: x } = qr({
		onEscape: () => {
			p(!1), a();
		},
		getFocusableElements: () => pn(m.current)
	});
	y(() => {
		s && !f && m.current?.querySelector("button")?.focus();
	}, [
		s,
		f,
		m
	]), y(() => {
		if (!s || f) return;
		let e = (e) => {
			let t = e.target;
			t && (m.current?.contains(t) || o.current?.contains(t) || a());
		};
		return document.addEventListener("pointerdown", e, !0), () => {
			document.removeEventListener("pointerdown", e, !0);
		};
	}, [
		s,
		f,
		a,
		o,
		m
	]);
	let S = (e) => {
		d(e ?? Jr), i(e), p(!1);
	}, C = (e, t) => {
		g.current.some((t) => Xr(t.color, e)) || (g.current = [{
			color: e,
			hex: t
		}, ...g.current].slice(0, Yr)), S(e);
	}, E = (e, t, n, r) => {
		let i = Xr(u, t), a = [
			"ic-color-picker__swatch",
			"ic-color-picker__swatch--selectable",
			qn(e) ? "ic-color-picker__swatch--white" : ""
		].filter(Boolean).join(" ");
		return /* @__PURE__ */ G("button", {
			type: "button",
			className: a,
			style: { backgroundColor: e },
			onClick: () => C(t, e),
			"aria-label": e,
			"data-nav-row": n,
			"data-nav-col": r,
			children: i ? /* @__PURE__ */ G(L, {
				className: "ic-color-picker__check-icon",
				style: { color: Jn(e) }
			}) : null
		}, `r${n}c${r}`);
	};
	return s ? f ? /* @__PURE__ */ G(Vr, {
		color: X(u, l) || Jr,
		onAccept: (e) => C(e, e),
		onCancel: () => p(!1),
		anchorEl: o,
		open: !0
	}) : Wt(/* @__PURE__ */ K("div", {
		ref: m,
		className: "ic-color-picker",
		style: h,
		role: "dialog",
		"aria-label": _("color_picker.add"),
		onKeyDown: x,
		onClick: (e) => {
			e.stopPropagation();
		},
		children: [
			/* @__PURE__ */ G("div", {
				className: "ic-color-picker__section",
				children: /* @__PURE__ */ K("button", {
					type: "button",
					className: "ic-color-picker__menu-item",
					onClick: () => S(t),
					"data-nav-row": 0,
					"data-nav-col": 0,
					children: [/* @__PURE__ */ G("span", {
						className: "ic-color-picker__menu-item-square",
						style: { backgroundColor: n },
						"aria-hidden": "true"
					}), /* @__PURE__ */ G("span", {
						className: "ic-color-picker__menu-item-text",
						children: r
					})]
				})
			}),
			/* @__PURE__ */ G("div", { className: "ic-color-picker__divider" }),
			/* @__PURE__ */ K("div", {
				className: "ic-color-picker__section",
				children: [
					/* @__PURE__ */ G("div", {
						className: "ic-color-picker__label",
						children: _("color_picker.themed_colors")
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-color-picker__color-list",
						children: v.map((e, t) => E(e, [t, 0], 1, t))
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-color-picker__color-grid",
						children: b.map((e, t) => /* @__PURE__ */ G("div", {
							className: "ic-color-picker__color-grid-col",
							children: e.map(({ hex: e, color: n }, r) => E(e, n, 2 + r, t))
						}, e.map((e) => e.hex).join("-")))
					})
				]
			}),
			/* @__PURE__ */ G("div", { className: "ic-color-picker__divider" }),
			/* @__PURE__ */ K("div", {
				className: "ic-color-picker__section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-color-picker__label",
					children: _("color_picker.standard_colors")
				}), /* @__PURE__ */ G("div", {
					className: "ic-color-picker__color-list",
					children: Gn.map((e, t) => E(e, e, 7, t))
				})]
			}),
			/* @__PURE__ */ G("div", { className: "ic-color-picker__divider" }),
			/* @__PURE__ */ K("div", {
				className: "ic-color-picker__section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-color-picker__label",
					children: _("color_picker.recent")
				}), /* @__PURE__ */ K("div", {
					className: "ic-color-picker__color-list",
					children: [g.current.map(({ color: e, hex: t }, n) => /* @__PURE__ */ G("button", {
						type: "button",
						className: ["ic-color-picker__swatch", qn(t) ? "ic-color-picker__swatch--white" : ""].filter(Boolean).join(" "),
						style: { backgroundColor: t },
						onClick: () => C(e, t),
						"aria-label": t,
						"data-nav-row": 8,
						"data-nav-col": n
					}, t)), /* @__PURE__ */ G("button", {
						type: "button",
						className: "ic-color-picker__plus-button",
						onClick: () => p(!0),
						title: _("color_picker.add"),
						"aria-label": _("color_picker.add"),
						"data-nav-row": 8,
						"data-nav-col": g.current.length,
						children: /* @__PURE__ */ G(Ie, {})
					})]
				})]
			})
		]
	}), o.current) : null;
}, Qr = [
	"number",
	"percent",
	"formula",
	"percentile"
], $r = [...Qr, "none"], ei = ["min", ...Qr], ti = ["max", ...Qr];
[...Qr];
var ni = [
	{
		id: "r-y-g",
		colors: [
			"#EC5753",
			"#F8CD3D",
			"#8CB354"
		]
	},
	{
		id: "g-y-r",
		colors: [
			"#8CB354",
			"#F8CD3D",
			"#EC5753"
		]
	},
	{
		id: "r-w-g",
		colors: [
			"#EC5753",
			"#FFFFFF",
			"#8CB354"
		]
	},
	{
		id: "g-w-r",
		colors: [
			"#8CB354",
			"#FFFFFF",
			"#EC5753"
		]
	},
	{
		id: "r-w-b",
		colors: [
			"#EC5753",
			"#FFFFFF",
			"#3458B7"
		]
	},
	{
		id: "b-w-r",
		colors: [
			"#3458B7",
			"#FFFFFF",
			"#EC5753"
		]
	},
	{
		id: "g-w-p",
		colors: [
			"#8CB354",
			"#FFFFFF",
			"#523E93"
		]
	},
	{
		id: "p-w-g",
		colors: [
			"#523E93",
			"#FFFFFF",
			"#8CB354"
		]
	},
	{
		id: "g-lg",
		colors: ["#8CB354", "#E8F0DD"]
	},
	{
		id: "lg-g",
		colors: ["#E8F0DD", "#8CB354"]
	},
	{
		id: "r-lr",
		colors: ["#EC5753", "#FBDDDD"]
	},
	{
		id: "lr-r",
		colors: ["#FBDDDD", "#EC5753"]
	},
	{
		id: "r-y-b",
		colors: [
			"#EC5753",
			"#F2994A",
			"#F8CD3D",
			"#8CB354",
			"#3458B7"
		]
	},
	{
		id: "b-y-r",
		colors: [
			"#3458B7",
			"#8CB354",
			"#F8CD3D",
			"#F2994A",
			"#EC5753"
		]
	},
	{
		id: "dp-m-r",
		colors: [
			"#35193E",
			"#AC0070",
			"#E13342",
			"#F37651",
			"#F6B48F"
		]
	},
	{
		id: "r-m-dp",
		colors: [
			"#F6B48F",
			"#F37651",
			"#E13342",
			"#AC0070",
			"#35193E"
		]
	}
], ri = 5;
function ii(e) {
	return [
		parseInt(e.slice(1, 3), 16),
		parseInt(e.slice(3, 5), 16),
		parseInt(e.slice(5, 7), 16)
	];
}
function ai(e, t, n) {
	return `#${[
		e,
		t,
		n
	].map((e) => Math.round(e).toString(16).padStart(2, "0")).join("")}`;
}
function oi(e, t, n) {
	let [r, i, a] = ii(e), [o, s, c] = ii(t);
	return ai(r + (o - r) * n, i + (s - i) * n, a + (c - a) * n);
}
function si(e, t) {
	let n = t * (e.length - 1), r = Math.floor(n), i = Math.min(r + 1, e.length - 1);
	return oi(e[r], e[i], n - r);
}
function ci(e) {
	let t = Array.from({ length: ri }, (t, n) => {
		let r = n / 4 * (e.length - 1), i = Math.floor(r), a = Math.min(i + 1, e.length - 1);
		return oi(e[i], e[a], r - i);
	}), n = 100 / ri;
	return `linear-gradient(to bottom, ${t.map((e, t) => `${e} ${t * n}%, ${e} ${(t + 1) * n}%`).join(", ")})`;
}
function li(e) {
	switch (e) {
		case "min": return ei;
		case "midpoint": return $r;
		case "max": return ti;
		default: return Qr;
	}
}
var ui = ({ label: e, stop: t, onChange: n, getSelectedArea: r, type: i, currentTheme: a }) => {
	let { t: o } = D(), [s, c] = T(!1), l = w(null), u = li(i).map((e) => ({
		value: e,
		label: o(`conditional_formatting.color_scale_type_${e}`)
	})), d = t.type === "none";
	return /* @__PURE__ */ K("div", {
		className: "ic-edit-rule-field-wrapper",
		children: [/* @__PURE__ */ G("span", {
			className: "ic-edit-rule-label",
			children: e
		}), /* @__PURE__ */ K("div", {
			className: "ic-cs-settings-row",
			children: [
				/* @__PURE__ */ G($n, {
					value: t.type,
					options: u,
					onChange: (e) => n({
						...t,
						type: e
					}),
					hideCheck: !0
				}),
				!d && t.type !== "min" && t.type !== "max" && /* @__PURE__ */ G(Y, {
					type: "text",
					value: t.value,
					onChange: (e) => n({
						...t,
						value: e.target.value
					}),
					endAdornment: /* @__PURE__ */ G(Z, {
						title: o("conditional_formatting.use_selection"),
						children: /* @__PURE__ */ G(J, {
							size: "sm",
							variant: "secondary",
							icon: /* @__PURE__ */ G(qe, {}),
							"aria-label": o("conditional_formatting.use_selection"),
							onClick: () => n({
								...t,
								value: r()
							}),
							className: "ic-edit-rule-range-button"
						})
					})
				}),
				!d && /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G("div", {
					className: "ic-input-control md ic-cs-color-swatch-wrapper",
					children: /* @__PURE__ */ G("button", {
						ref: l,
						type: "button",
						className: "ic-cs-color-swatch",
						style: { backgroundColor: X(t.color, a) },
						onClick: () => c(!0),
						"aria-label": e
					})
				}), /* @__PURE__ */ G(Zr, {
					color: t.color,
					defaultColor: X(t.color, a),
					title: o("color_picker.default"),
					onChange: (e) => {
						n({
							...t,
							color: e
						}), c(!1);
					},
					onClose: () => c(!1),
					anchorEl: l,
					open: s,
					theme: a
				})] })
			]
		})]
	});
}, di = ({ onSave: e, onCancel: t, applyTo: n, onApplyToChange: r, initialValues: i, onPreviewChange: a, getSelectedArea: o, currentTheme: s }) => {
	let { t: c } = D(), [l, u] = T(ni[0].id), [d, f] = T(i?.minimum ?? {
		type: "min",
		value: "",
		color: si(ni[0].colors, 0)
	}), [p, m] = T(i?.midpoint ?? {
		type: "percentile",
		value: "50",
		color: si(ni[0].colors, .5)
	}), [h, g] = T(i?.maximum ?? {
		type: "max",
		value: "",
		color: si(ni[0].colors, 1)
	}), _ = (e) => {
		let t = e.length === 2;
		f((t) => ({
			...t,
			color: si(e, 0)
		})), m((n) => ({
			color: si(e, .5),
			type: t ? "none" : n.type === "none" ? "percentile" : n.type,
			value: t ? "" : n.type === "none" ? "50" : n.value
		})), g((t) => ({
			...t,
			color: si(e, 1)
		}));
	};
	y(() => {
		let e = p.type === "none" ? oi(X(d.color, s), X(h.color, s), .5) : X(p.color, s);
		a?.([
			X(d.color, s),
			e,
			X(h.color, s)
		]);
	}, [
		d.color,
		p.color,
		p.type,
		h.color,
		a,
		s
	]);
	let v = (e) => e.type === "min" || e.type === "max" || e.type === "none" || e.value.trim() !== "", b = n.trim() !== "" && v(d) && v(p) && v(h);
	return /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ K("div", {
		className: "ic-edit-rule-content",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-edit-rule-section-title",
					children: c("conditional_formatting.apply_to")
				}), /* @__PURE__ */ K("div", {
					className: "ic-edit-rule-field-wrapper",
					children: [/* @__PURE__ */ G("span", {
						className: "ic-edit-rule-label",
						children: c("conditional_formatting.apply_to_range")
					}), /* @__PURE__ */ G(Y, {
						type: "text",
						placeholder: c("conditional_formatting.apply_to_placeholder"),
						value: n,
						onChange: (e) => r(e.target.value),
						endAdornment: /* @__PURE__ */ G(Z, {
							title: c("conditional_formatting.use_selection"),
							children: /* @__PURE__ */ G(J, {
								size: "sm",
								variant: "secondary",
								icon: /* @__PURE__ */ G(qe, {}),
								"aria-label": c("conditional_formatting.use_selection"),
								onClick: () => r(o()),
								className: "ic-edit-rule-range-button"
							})
						})
					})]
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-edit-rule-section-title",
					children: c("conditional_formatting.tab_color_scale")
				}), /* @__PURE__ */ K("div", {
					className: "ic-fsp-presets-section",
					children: [/* @__PURE__ */ G("div", {
						className: "ic-edit-rule-label",
						children: c("conditional_formatting.default_styles")
					}), /* @__PURE__ */ G("div", {
						className: "ic-fsp-presets",
						children: ni.map((e) => /* @__PURE__ */ G("button", {
							type: "button",
							"aria-pressed": l === e.id,
							className: "ic-fsp-preset",
							style: { background: ci(e.colors) },
							onClick: () => {
								u(e.id), _(e.colors);
							}
						}, e.id))
					})]
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [
					/* @__PURE__ */ G("div", {
						className: "ic-edit-rule-section-title",
						children: c("conditional_formatting.color_scale_settings")
					}),
					/* @__PURE__ */ G(ui, {
						label: c("conditional_formatting.color_scale_minimum"),
						stop: d,
						onChange: f,
						getSelectedArea: o,
						type: "min",
						currentTheme: s
					}),
					/* @__PURE__ */ G(ui, {
						label: c("conditional_formatting.color_scale_midpoint"),
						stop: p,
						onChange: m,
						getSelectedArea: o,
						type: "midpoint",
						currentTheme: s
					}),
					/* @__PURE__ */ G(ui, {
						label: c("conditional_formatting.color_scale_maximum"),
						stop: h,
						onChange: g,
						getSelectedArea: o,
						type: "max",
						currentTheme: s
					})
				]
			})
		]
	}), /* @__PURE__ */ K("div", {
		className: "ic-edit-rule-footer",
		children: [/* @__PURE__ */ G(q, {
			variant: "secondary",
			onClick: t,
			children: c("conditional_formatting.cancel")
		}), /* @__PURE__ */ G(q, {
			startIcon: /* @__PURE__ */ G(L, {}),
			disabled: !b,
			onClick: () => e({
				minimum: d,
				midpoint: p,
				maximum: h
			}),
			children: c("conditional_formatting.apply")
		})]
	})] });
}, fi = {
	between: "Between",
	not_between: "NotBetween",
	less_than: "LessThan",
	less_than_or_equal: "LessThanOrEqual",
	greater_than: "GreaterThan",
	greater_than_or_equal: "GreaterThanOrEqual",
	equals: "Equal",
	does_not_equal: "NotEqual"
}, pi = {
	Between: "between",
	NotBetween: "not_between",
	LessThan: "less_than",
	LessThanOrEqual: "less_than_or_equal",
	GreaterThan: "greater_than",
	GreaterThanOrEqual: "greater_than_or_equal",
	Equal: "equals",
	NotEqual: "does_not_equal"
}, mi = {
	contains: "Contains",
	does_not_contain: "DoesNotContain",
	begins_with: "BeginsWith",
	ends_with: "EndsWith",
	equals: "Equals"
}, hi = {
	Contains: "contains",
	DoesNotContain: "does_not_contain",
	BeginsWith: "begins_with",
	EndsWith: "ends_with",
	Equals: "equals"
}, gi = {
	between: "Between",
	not_between: "NotBetween",
	yesterday: "Yesterday",
	today: "Today",
	tomorrow: "Tomorrow",
	in_last_7_days: "Last7Days",
	in_next_7_days: "Next7Days",
	last_week: "LastWeek",
	this_week: "ThisWeek",
	next_week: "NextWeek",
	last_month: "LastMonth",
	this_month: "ThisMonth",
	next_month: "NextMonth",
	last_year: "LastYear",
	this_year: "ThisYear",
	next_year: "NextYear"
}, _i = {
	Between: "between",
	NotBetween: "not_between",
	Yesterday: "yesterday",
	Today: "today",
	Tomorrow: "tomorrow",
	Last7Days: "in_last_7_days",
	Next7Days: "in_next_7_days",
	LastWeek: "last_week",
	ThisWeek: "this_week",
	NextWeek: "next_week",
	LastMonth: "last_month",
	ThisMonth: "this_month",
	NextMonth: "next_month",
	LastYear: "last_year",
	ThisYear: "this_year",
	NextYear: "next_year"
}, vi = /* @__PURE__ */ new Set([
	"cell_value",
	"text",
	"date",
	"formula",
	"duplicate_values",
	"unique_values",
	"blanks",
	"no_blanks",
	"errors",
	"no_errors"
]);
function yi(e) {
	return vi.has(e);
}
function bi(e) {
	let t = {};
	if (e.bold || e.italic || e.underline || e.strike || e.fontColor) {
		let n = {};
		e.bold && (n.b = !0), e.italic && (n.i = !0), e.underline && (n.u = !0), e.strike && (n.strike = !0), e.fontColor && (n.color = e.fontColor), t.font = n;
	}
	return e.fillColor && (t.fill = { color: e.fillColor }), t;
}
function xi(e) {
	return {
		bold: e?.font?.b ?? !1,
		italic: e?.font?.i ?? !1,
		underline: e?.font?.u ?? !1,
		strike: e?.font?.strike ?? !1,
		fontColor: e?.font?.color ?? "",
		fillColor: e?.fill?.color
	};
}
function Si(e) {
	switch (e.type) {
		case "min": return "Min";
		case "max": return "Max";
		case "number": return { Number: parseFloat(e.value) };
		case "percent": return { Percent: parseFloat(e.value) };
		case "percentile": return { Percentile: parseFloat(e.value) };
		case "formula": return { Formula: e.value };
		case "none": return { Percent: 50 };
	}
}
function Ci(e, t) {
	return e === "Min" ? {
		type: "min",
		value: "",
		color: t
	} : e === "Max" ? {
		type: "max",
		value: "",
		color: t
	} : "Number" in e ? {
		type: "number",
		value: `${e.Number}`,
		color: t
	} : "Percent" in e ? {
		type: "percent",
		value: `${e.Percent}`,
		color: t
	} : "Percentile" in e ? {
		type: "percentile",
		value: `${e.Percentile}`,
		color: t
	} : {
		type: "formula",
		value: e.Formula,
		color: t
	};
}
var wi = {
	"dir-3-arrows-color": [
		"ArrowUp",
		"ArrowRight",
		"ArrowDown"
	],
	"dir-3-chevrons-color": [
		"TriangleUp",
		"FlatRectangle",
		"TriangleDown"
	],
	"dir-4-arrows-color": [
		"ArrowUp",
		"ArrowAngleUp",
		"ArrowAngleDown",
		"ArrowDown"
	],
	"dir-5-arrows-color": [
		"ArrowUp",
		"ArrowAngleUp",
		"ArrowRight",
		"ArrowAngleDown",
		"ArrowDown"
	],
	"shapes-3-circles-color": [
		"Circle",
		"Circle",
		"Circle"
	],
	"shapes-4-circles-color": [
		"Circle",
		"Circle",
		"Circle",
		"Circle"
	],
	"shapes-3-multiple": [
		"Rhombus",
		"TriangleUpFilled",
		"Circle"
	],
	"shapes-4-circles": [
		"Circle",
		"Circle",
		"Circle",
		"Circle"
	],
	"ind-2-triangles": ["TriangleUpFilled", "TriangleDownFilled"],
	"ind-2-arrows": ["ArrowUp", "ArrowDown"],
	"ind-2-thumbs": ["ThumbsUp", "ThumbsDown"],
	"ind-3-checkx": ["Check", "Cross"],
	"ind-3-check-exclaim-x": [
		"Check",
		"Exclamation",
		"Cross"
	],
	"ind-4-flags": [
		"Flag",
		"Flag",
		"Flag"
	]
}, Ti = {
	2: "ind-3-checkx",
	3: "dir-3-arrows-color",
	4: "dir-4-arrows-color",
	5: "dir-5-arrows-color"
};
function Ei(e) {
	let t = e.length;
	for (let [n, r] of Object.entries(wi)) if (r.length === t && r.every((t, n) => t === e[n])) return n;
	return Ti[t] ?? "dir-3-arrows-color";
}
function Di(e) {
	switch (e.type) {
		case "percent": return { Percent: parseFloat(e.value) || 0 };
		case "number": return { Number: parseFloat(e.value) || 0 };
		case "percentile": return { Percentile: parseFloat(e.value) || 0 };
		case "formula": return { Formula: e.value };
		case "min": return { Percent: 0 };
		case "max": return { Percent: 100 };
	}
}
function Oi(e, t) {
	return e === "Min" || e === "Max" ? {
		operator: "<=",
		value: "",
		type: e === "Min" ? "min" : "max",
		color: t
	} : "Percent" in e ? {
		operator: "<=",
		value: `${e.Percent}`,
		type: "percent",
		color: t
	} : "Number" in e ? {
		operator: "<=",
		value: `${e.Number}`,
		type: "number",
		color: t
	} : "Percentile" in e ? {
		operator: "<=",
		value: `${e.Percentile}`,
		type: "percentile",
		color: t
	} : {
		operator: "<=",
		value: e.Formula,
		type: "formula",
		color: t
	};
}
function ki(e, t, n, r, i) {
	return Array.from({ length: i }, (a, o) => {
		let s = i - 1 - o, c = t[s] ?? "#808080", l = n[s] ?? "ArrowUp", u = r[s] ?? !0 ? ">=" : ">";
		if (o === i - 1) return {
			operator: u,
			value: "",
			type: "percent",
			color: c,
			iconName: l
		};
		let d = e[s];
		if (!d || d === "Min") return {
			operator: u,
			value: String(Math.round((i - 1 - o) * 100 / i)),
			type: "percent",
			color: c,
			iconName: l
		};
		let f = Oi(d, c);
		return {
			operator: u,
			value: f.value,
			type: f.type,
			color: c,
			iconName: l
		};
	});
}
function Ai(e) {
	switch (e.type) {
		case "automatic": return null;
		case "min": return "Min";
		case "max": return "Max";
		case "number": return { Number: parseFloat(e.value) || 0 };
		case "percent": return { Percent: parseFloat(e.value) || 0 };
		case "percentile": return { Percentile: parseFloat(e.value) || 0 };
		case "formula": return { Formula: e.value };
	}
}
function ji(e) {
	return e === null ? {
		type: "automatic",
		value: ""
	} : e === "Min" ? {
		type: "min",
		value: ""
	} : e === "Max" ? {
		type: "max",
		value: ""
	} : "Number" in e ? {
		type: "number",
		value: `${e.Number}`
	} : "Percent" in e ? {
		type: "percent",
		value: `${e.Percent}`
	} : "Percentile" in e ? {
		type: "percentile",
		value: `${e.Percentile}`
	} : {
		type: "formula",
		value: e.Formula
	};
}
function Mi(e) {
	switch (e.ruleType) {
		case "color_scale": {
			if (!e.colorScale) return null;
			let { minimum: t, midpoint: n, maximum: r } = e.colorScale;
			return {
				type: "ColorScale",
				thresholds: n.type === "none" ? [{
					cfvo: Si(t),
					color: t.color
				}, {
					cfvo: Si(r),
					color: r.color
				}] : [
					{
						cfvo: Si(t),
						color: t.color
					},
					{
						cfvo: Si(n),
						color: n.color
					},
					{
						cfvo: Si(r),
						color: r.color
					}
				]
			};
		}
		case "data_bars": return e.dataBars ? {
			type: "DataBar",
			min: Ai(e.dataBars.minBound),
			max: Ai(e.dataBars.maxBound),
			positive_color: e.dataBars.positiveColor,
			negative_color: e.dataBars.negativeColor,
			is_gradient: e.dataBars.gradient,
			show_value: !e.dataBars.hideCellContent
		} : null;
		case "icon_sets": {
			if (!e.iconSets) return null;
			let { presetId: t, rating: n, thresholds: r, showValue: i } = e.iconSets, a = i ?? !0;
			if (n) {
				let e = [[{ Percent: 0 }, !0], ...r.slice(0, -1).reverse().map((e) => [Di(e), e.operator === ">="])];
				return {
					type: "IconRating",
					icon: n.icon,
					color: n.color,
					thresholds: e,
					show_value: a
				};
			}
			let o = wi[t];
			if (!o) return null;
			let s = o.length;
			return r.length === s ? {
				type: "IconSet",
				thresholds: o.map((e, t) => {
					let n = s - 1 - t;
					return {
						icon: r[n]?.iconName ?? o[n],
						cfvo: t === 0 ? "Min" : Di(r[n]),
						color: r[n].color,
						is_strict: t === 0 || r[n].operator === ">="
					};
				}),
				show_value: a
			} : null;
		}
		case "cell_value": {
			let t = fi[e.ruleOperator];
			if (!t) return null;
			let n = e.ruleOperator === "between" || e.ruleOperator === "not_between";
			return {
				type: "CellIs",
				operator: t,
				formula: e.ruleValue,
				formula2: n ? e.ruleValue2 : null,
				format: bi(e.formatStyle),
				stop_if_true: e.stopIfTrue ?? !1
			};
		}
		case "text": {
			let t = mi[e.ruleOperator];
			return t ? {
				type: "Text",
				operator: t,
				value: e.ruleValue,
				format: bi(e.formatStyle),
				stop_if_true: e.stopIfTrue ?? !1
			} : null;
		}
		case "date": {
			let t = gi[e.ruleOperator];
			if (!t) return null;
			let n = e.ruleOperator === "between" || e.ruleOperator === "not_between";
			return {
				type: "TimePeriod",
				time_period: t,
				date1: n ? e.ruleValue : null,
				date2: n ? e.ruleValue2 : null,
				format: bi(e.formatStyle),
				stop_if_true: e.stopIfTrue ?? !1
			};
		}
		case "duplicate_values": return {
			type: "DuplicateValues",
			format: bi(e.formatStyle),
			stop_if_true: e.stopIfTrue ?? !1
		};
		case "unique_values": return {
			type: "UniqueValues",
			format: bi(e.formatStyle),
			stop_if_true: e.stopIfTrue ?? !1
		};
		case "blanks": return {
			type: "Blanks",
			format: bi(e.formatStyle),
			stop_if_true: e.stopIfTrue ?? !1
		};
		case "no_blanks": return {
			type: "NotBlanks",
			format: bi(e.formatStyle),
			stop_if_true: e.stopIfTrue ?? !1
		};
		case "errors": return {
			type: "Errors",
			format: bi(e.formatStyle),
			stop_if_true: e.stopIfTrue ?? !1
		};
		case "no_errors": return {
			type: "NoErrors",
			format: bi(e.formatStyle),
			stop_if_true: e.stopIfTrue ?? !1
		};
		case "formula": return {
			type: "Formula",
			formula: e.ruleValue,
			format: bi(e.formatStyle),
			stop_if_true: e.stopIfTrue ?? !1
		};
		default: return null;
	}
}
function Ni(e) {
	let { cf_rule: t } = e;
	switch (t.type) {
		case "ColorScale": {
			let e = t.thresholds.length;
			return e < 2 || e > 3 ? null : {
				ruleType: "color_scale",
				ruleOperator: "",
				ruleValue: "",
				ruleValue2: "",
				colorScale: e === 2 ? {
					minimum: Ci(t.thresholds[0].cfvo, t.thresholds[0].color),
					midpoint: {
						type: "none",
						value: "",
						color: ""
					},
					maximum: Ci(t.thresholds[1].cfvo, t.thresholds[1].color)
				} : {
					minimum: Ci(t.thresholds[0].cfvo, t.thresholds[0].color),
					midpoint: Ci(t.thresholds[1].cfvo, t.thresholds[1].color),
					maximum: Ci(t.thresholds[2].cfvo, t.thresholds[2].color)
				}
			};
		}
		case "DataBar": return {
			ruleType: "data_bars",
			ruleOperator: "",
			ruleValue: "",
			ruleValue2: "",
			dataBars: {
				color: typeof t.positive_color == "string" ? t.positive_color : "",
				gradient: t.is_gradient,
				positiveColor: t.positive_color,
				negativeColor: t.negative_color,
				hideCellContent: !t.show_value,
				minBound: ji(t.min || null),
				maxBound: ji(t.max || null)
			}
		};
		case "IconSet": {
			let e = t.thresholds.map((e) => e.icon), n = t.thresholds.map((e) => e.cfvo), r = t.thresholds.map((e) => e.color), i = t.thresholds.map((e) => e.is_strict), a = e.length;
			return {
				ruleType: "icon_sets",
				ruleOperator: "",
				ruleValue: "",
				ruleValue2: "",
				iconSets: {
					presetId: Ei([...e].reverse()),
					thresholds: ki(n, r, e, i, a),
					showValue: t.show_value
				}
			};
		}
		case "IconRating": {
			let e = t.thresholds.length, n = t.thresholds.map(([e]) => e), r = t.thresholds.map(([, e]) => e), i = ki(n, Array(e).fill(t.color), Array(e).fill(t.icon), r, e);
			return {
				ruleType: "icon_sets",
				ruleOperator: "",
				ruleValue: "",
				ruleValue2: "",
				iconSets: {
					presetId: "dir-3-arrows-color",
					rating: {
						count: e,
						icon: t.icon,
						color: t.color
					},
					thresholds: i,
					showValue: t.show_value
				}
			};
		}
		case "CellIs": {
			let e = pi[t.operator];
			return e ? {
				ruleType: "cell_value",
				ruleOperator: e,
				ruleValue: t.formula,
				ruleValue2: t.formula2 ?? "",
				stopIfTrue: t.stop_if_true
			} : null;
		}
		case "Text": {
			let e = hi[t.operator];
			return e ? {
				ruleType: "text",
				ruleOperator: e,
				ruleValue: t.value,
				ruleValue2: "",
				stopIfTrue: t.stop_if_true
			} : null;
		}
		case "TimePeriod": {
			let e = _i[t.time_period];
			return e ? {
				ruleType: "date",
				ruleOperator: e,
				ruleValue: t.date1 ?? "",
				ruleValue2: t.date2 ?? "",
				stopIfTrue: t.stop_if_true
			} : null;
		}
		case "DuplicateValues": return {
			ruleType: "duplicate_values",
			ruleOperator: "",
			ruleValue: "",
			ruleValue2: "",
			stopIfTrue: t.stop_if_true
		};
		case "UniqueValues": return {
			ruleType: "unique_values",
			ruleOperator: "",
			ruleValue: "",
			ruleValue2: "",
			stopIfTrue: t.stop_if_true
		};
		case "Blanks": return {
			ruleType: "blanks",
			ruleOperator: "",
			ruleValue: "",
			ruleValue2: "",
			stopIfTrue: t.stop_if_true
		};
		case "NotBlanks": return {
			ruleType: "no_blanks",
			ruleOperator: "",
			ruleValue: "",
			ruleValue2: "",
			stopIfTrue: t.stop_if_true
		};
		case "Errors": return {
			ruleType: "errors",
			ruleOperator: "",
			ruleValue: "",
			ruleValue2: "",
			stopIfTrue: t.stop_if_true
		};
		case "NoErrors": return {
			ruleType: "no_errors",
			ruleOperator: "",
			ruleValue: "",
			ruleValue2: "",
			stopIfTrue: t.stop_if_true
		};
		case "Formula": return {
			ruleType: "formula",
			ruleOperator: "",
			ruleValue: t.formula,
			ruleValue2: "",
			stopIfTrue: t.stop_if_true
		};
		default: return null;
	}
}
//#endregion
//#region src/components/Checkbox/Checkbox.tsx
var Pi = g(function({ checked: e, onChange: t, label: n, disabled: r = !1, id: i, style: a, className: o, ...s }, c) {
	let l = b(), u = i ?? l, d = [
		"ic-checkbox",
		r && "disabled",
		o
	].filter(Boolean).join(" ");
	return /* @__PURE__ */ K("label", {
		className: d,
		style: a,
		htmlFor: u,
		children: [
			/* @__PURE__ */ G("input", {
				ref: c,
				id: u,
				type: "checkbox",
				checked: e,
				disabled: r,
				onChange: (e) => t(e.target.checked),
				className: "ic-checkbox-input",
				...s
			}),
			/* @__PURE__ */ G("span", {
				className: "ic-checkbox-box",
				"aria-hidden": "true"
			}),
			n && /* @__PURE__ */ G("span", {
				className: "ic-checkbox-label",
				children: n
			})
		]
	});
});
Pi.displayName = "Checkbox";
//#endregion
//#region src/components/RightDrawer/ConditionalFormatting/DataBarsRule.tsx
var Fi = [
	"#8CB354",
	"#EC5753",
	"#3458B7",
	"#F2994A",
	"#F8CD3D",
	"#523E93",
	"#FF2D55",
	"#333333"
], Ii = [
	.6,
	.85,
	.35,
	.55
], Li = ({ color: e, gradient: t }) => {
	let n = t ? `linear-gradient(to right, ${e}, ${e}1a)` : e;
	return /* @__PURE__ */ G("div", {
		className: "ic-db-mini-chart",
		children: Ii.map((e) => /* @__PURE__ */ G("div", {
			className: "ic-db-bar-segment",
			children: /* @__PURE__ */ G("div", { style: {
				width: `${e * 100}%`,
				height: "100%",
				background: n
			} })
		}, e))
	});
}, Ri = ({ color: e, gradient: t, selected: n, onClick: r, label: i }) => {
	let a = { background: t ? `linear-gradient(to right, ${e}, ${e}1a)` : e };
	return /* @__PURE__ */ G("button", {
		type: "button",
		onClick: r,
		"aria-pressed": n,
		className: "ic-fsp-preset ic-db-swatch",
		"aria-label": i,
		children: /* @__PURE__ */ G("div", {
			className: "ic-db-swatch-inner",
			children: Ii.map((e) => /* @__PURE__ */ G("div", {
				className: "ic-db-swatch-row",
				children: /* @__PURE__ */ G("div", {
					className: "ic-db-swatch-bar",
					style: {
						width: `${e * 100}%`,
						...a
					}
				})
			}, e))
		})
	});
}, zi = [
	"automatic",
	"min",
	"max"
], Bi = ({ onSave: e, onCancel: t, applyTo: n, onApplyToChange: r, getSelectedArea: i, initialValues: a, onPreviewChange: o, currentTheme: s }) => {
	let { t: c } = D(), [l, u] = T(!1), [d, f] = T(!1), p = w(null), m = w(null), [h, g] = T(a ?? {
		color: Fi[0],
		gradient: !1,
		positiveColor: "#6AAB42",
		negativeColor: "#E05C53",
		hideCellContent: !1,
		minBound: {
			type: "automatic",
			value: ""
		},
		maxBound: {
			type: "automatic",
			value: ""
		}
	});
	y(() => {
		o?.(h);
	}, [h, o]);
	let _ = [
		{
			value: "automatic",
			label: c("conditional_formatting.data_bars_type_automatic")
		},
		{
			value: "min",
			label: c("conditional_formatting.color_scale_type_min")
		},
		{
			value: "number",
			label: c("conditional_formatting.color_scale_type_number")
		},
		{
			value: "percent",
			label: c("conditional_formatting.color_scale_type_percent")
		},
		{
			value: "percentile",
			label: c("conditional_formatting.color_scale_type_percentile")
		},
		{
			value: "formula",
			label: c("conditional_formatting.color_scale_type_formula")
		}
	], v = [
		{
			value: "automatic",
			label: c("conditional_formatting.data_bars_type_automatic")
		},
		{
			value: "max",
			label: c("conditional_formatting.color_scale_type_max")
		},
		{
			value: "number",
			label: c("conditional_formatting.color_scale_type_number")
		},
		{
			value: "percent",
			label: c("conditional_formatting.color_scale_type_percent")
		},
		{
			value: "percentile",
			label: c("conditional_formatting.color_scale_type_percentile")
		},
		{
			value: "formula",
			label: c("conditional_formatting.color_scale_type_formula")
		}
	];
	return /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ K("div", {
		className: "ic-edit-rule-content",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-edit-rule-section-title",
					children: c("conditional_formatting.apply_to")
				}), /* @__PURE__ */ K("div", {
					className: "ic-edit-rule-field-wrapper",
					children: [/* @__PURE__ */ G("span", {
						className: "ic-edit-rule-label",
						children: c("conditional_formatting.apply_to_range")
					}), /* @__PURE__ */ G(Y, {
						type: "text",
						placeholder: c("conditional_formatting.apply_to_placeholder"),
						value: n,
						onChange: (e) => r(e.target.value),
						endAdornment: /* @__PURE__ */ G(Z, {
							title: c("conditional_formatting.use_selection"),
							children: /* @__PURE__ */ G(J, {
								size: "sm",
								variant: "secondary",
								icon: /* @__PURE__ */ G(qe, {}),
								"aria-label": c("conditional_formatting.use_selection"),
								onClick: () => r(i()),
								className: "ic-edit-rule-range-button"
							})
						})
					})]
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [
					/* @__PURE__ */ G("div", {
						className: "ic-edit-rule-section-title",
						children: c("conditional_formatting.tab_data_bars")
					}),
					/* @__PURE__ */ K("div", {
						className: "ic-fsp-presets-section",
						children: [/* @__PURE__ */ G("div", {
							className: "ic-edit-rule-label",
							children: c("conditional_formatting.data_bars_solid_fill")
						}), /* @__PURE__ */ G("div", {
							className: "ic-fsp-presets",
							children: Fi.map((e) => /* @__PURE__ */ G(Ri, {
								color: e,
								gradient: !1,
								selected: h.color === e && !h.gradient,
								onClick: () => g((t) => ({
									...t,
									color: e,
									gradient: !1,
									positiveColor: e
								})),
								label: e
							}, `solid-${e}`))
						})]
					}),
					/* @__PURE__ */ K("div", {
						className: "ic-fsp-presets-section",
						children: [/* @__PURE__ */ G("div", {
							className: "ic-edit-rule-label",
							children: c("conditional_formatting.data_bars_gradient_fill")
						}), /* @__PURE__ */ G("div", {
							className: "ic-fsp-presets",
							children: Fi.map((e) => /* @__PURE__ */ G(Ri, {
								color: e,
								gradient: !0,
								selected: h.color === e && h.gradient,
								onClick: () => g((t) => ({
									...t,
									color: e,
									gradient: !0,
									positiveColor: e
								})),
								label: e
							}, `gradient-${e}`))
						})]
					})
				]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [
					/* @__PURE__ */ G("div", {
						className: "ic-edit-rule-section-title",
						children: c("conditional_formatting.data_bars_settings")
					}),
					/* @__PURE__ */ K("div", {
						className: "ic-edit-rule-values-row",
						children: [/* @__PURE__ */ K("div", {
							className: "ic-edit-rule-field-wrapper",
							children: [
								/* @__PURE__ */ G("span", {
									className: "ic-edit-rule-label",
									children: c("conditional_formatting.data_bars_minimum")
								}),
								/* @__PURE__ */ G($n, {
									value: h.minBound.type,
									options: _,
									onChange: (e) => g((t) => ({
										...t,
										minBound: {
											type: e,
											value: ""
										}
									})),
									hideCheck: !0
								}),
								/* @__PURE__ */ G(Y, {
									type: "text",
									value: h.minBound.value,
									disabled: zi.includes(h.minBound.type),
									onChange: (e) => g((t) => ({
										...t,
										minBound: {
											...t.minBound,
											value: e.target.value
										}
									}))
								})
							]
						}), /* @__PURE__ */ K("div", {
							className: "ic-edit-rule-field-wrapper",
							children: [
								/* @__PURE__ */ G("span", {
									className: "ic-edit-rule-label",
									children: c("conditional_formatting.data_bars_maximum")
								}),
								/* @__PURE__ */ G($n, {
									value: h.maxBound.type,
									options: v,
									onChange: (e) => g((t) => ({
										...t,
										maxBound: {
											type: e,
											value: ""
										}
									})),
									hideCheck: !0
								}),
								/* @__PURE__ */ G(Y, {
									type: "text",
									value: h.maxBound.value,
									disabled: zi.includes(h.maxBound.type),
									onChange: (e) => g((t) => ({
										...t,
										maxBound: {
											...t.maxBound,
											value: e.target.value
										}
									}))
								})
							]
						})]
					}),
					/* @__PURE__ */ K("div", {
						className: "ic-edit-rule-values-row",
						children: [/* @__PURE__ */ K("div", {
							className: "ic-edit-rule-field-wrapper",
							children: [/* @__PURE__ */ G("span", {
								className: "ic-edit-rule-label",
								children: c("conditional_formatting.data_bars_positive")
							}), /* @__PURE__ */ K("div", {
								className: "ic-cs-settings-row",
								children: [
									/* @__PURE__ */ G(Y, {
										type: "text",
										value: X(h.positiveColor, s),
										onChange: (e) => g((t) => ({
											...t,
											positiveColor: e.target.value
										}))
									}),
									/* @__PURE__ */ G("div", {
										className: "ic-input-control md ic-cs-color-swatch-wrapper",
										children: /* @__PURE__ */ G("button", {
											ref: p,
											type: "button",
											className: "ic-cs-color-swatch",
											style: { backgroundColor: X(h.positiveColor, s) },
											onClick: () => u(!0),
											"aria-label": c("conditional_formatting.data_bars_positive")
										})
									}),
									/* @__PURE__ */ G(Zr, {
										color: h.positiveColor,
										defaultColor: X(h.positiveColor, s),
										title: c("color_picker.default"),
										onChange: (e) => {
											g((t) => ({
												...t,
												positiveColor: e
											})), u(!1);
										},
										onClose: () => u(!1),
										anchorEl: p,
										open: l,
										theme: s
									})
								]
							})]
						}), /* @__PURE__ */ K("div", {
							className: "ic-edit-rule-field-wrapper",
							children: [/* @__PURE__ */ G("span", {
								className: "ic-edit-rule-label",
								children: c("conditional_formatting.data_bars_negative")
							}), /* @__PURE__ */ K("div", {
								className: "ic-cs-settings-row",
								children: [
									/* @__PURE__ */ G(Y, {
										type: "text",
										value: X(h.negativeColor, s),
										onChange: (e) => g((t) => ({
											...t,
											negativeColor: e.target.value
										}))
									}),
									/* @__PURE__ */ G("div", {
										className: "ic-input-control md ic-cs-color-swatch-wrapper",
										children: /* @__PURE__ */ G("button", {
											ref: m,
											type: "button",
											className: "ic-cs-color-swatch",
											style: { backgroundColor: X(h.negativeColor, s) },
											onClick: () => f(!0),
											"aria-label": c("conditional_formatting.data_bars_negative")
										})
									}),
									/* @__PURE__ */ G(Zr, {
										color: h.negativeColor,
										defaultColor: X(h.negativeColor, s),
										title: c("color_picker.default"),
										onChange: (e) => {
											g((t) => ({
												...t,
												negativeColor: e
											})), f(!1);
										},
										onClose: () => f(!1),
										anchorEl: m,
										open: d,
										theme: s
									})
								]
							})]
						})]
					}),
					/* @__PURE__ */ K("div", {
						className: "ic-fsp-presets-section",
						children: [/* @__PURE__ */ G("div", {
							className: "ic-edit-rule-label",
							children: c("conditional_formatting.data_bars_preferences")
						}), /* @__PURE__ */ G(Pi, {
							checked: !h.hideCellContent,
							onChange: (e) => g((t) => ({
								...t,
								hideCellContent: !e
							})),
							label: c("conditional_formatting.data_bars_show_value")
						})]
					})
				]
			})
		]
	}), /* @__PURE__ */ K("div", {
		className: "ic-edit-rule-footer",
		children: [/* @__PURE__ */ G(q, {
			variant: "secondary",
			onClick: t,
			children: c("conditional_formatting.cancel")
		}), /* @__PURE__ */ G(q, {
			startIcon: /* @__PURE__ */ G(L, {}),
			disabled: !n.trim(),
			onClick: () => e(h),
			children: c("conditional_formatting.apply")
		})]
	})] });
}, Vi = {
	bold: !1,
	italic: !1,
	underline: !1,
	strike: !1,
	fontColor: "",
	fillColor: ""
}, Hi = [
	{
		...Vi,
		fontColor: "#D21D21",
		fillColor: "#FBE7E8"
	},
	{
		...Vi,
		fontColor: "#D21D21",
		fillColor: ""
	},
	{
		...Vi,
		fontColor: "#8B6F00",
		fillColor: "#FEF9E8"
	},
	{
		...Vi,
		fontColor: "#8B6F00",
		fillColor: ""
	},
	{
		...Vi,
		fontColor: "#A5530A",
		fillColor: "#FCE7D4"
	},
	{
		...Vi,
		fontColor: "#A5530A",
		fillColor: ""
	},
	{
		...Vi,
		fontColor: "#008121",
		fillColor: "#F1F6EA"
	},
	{
		...Vi,
		fontColor: "#008121",
		fillColor: ""
	}
], Ui = ({ value: e, onChange: t, currentTheme: n }) => {
	let { t: r } = D(), [i, a] = T(!1), [o, s] = T(!1), c = w(null), l = w(null), u = (n) => t({
		...e,
		[n]: !e[n]
	}), d = {
		fontWeight: e.bold ? "bold" : "normal",
		fontStyle: e.italic ? "italic" : "normal",
		textDecoration: [e.underline ? "underline" : "", e.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none",
		color: X(e.fontColor, n) || "var(--palette-sheet-default-text-color)",
		backgroundColor: X(e.fillColor, n) || "transparent"
	};
	return /* @__PURE__ */ K("div", {
		className: "ic-fsp-wrapper",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-fsp-editor",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-fsp-preview",
					style: d,
					children: "AaBbCc"
				}), /* @__PURE__ */ K("div", {
					className: "ic-fsp-toolbar",
					children: [/* @__PURE__ */ K("div", {
						className: "ic-fsp-toolbar-left",
						children: [
							/* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(re, {}),
								pressed: e.bold,
								"aria-label": r("toolbar.bold"),
								onClick: () => u("bold")
							}),
							/* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(Se, {}),
								pressed: e.italic,
								"aria-label": r("toolbar.italic"),
								onClick: () => u("italic")
							}),
							/* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(ot, {}),
								pressed: e.underline,
								"aria-label": r("toolbar.underline"),
								onClick: () => u("underline")
							}),
							/* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(Ye, {}),
								pressed: e.strike,
								"aria-label": r("toolbar.strike_through"),
								onClick: () => u("strike")
							}),
							/* @__PURE__ */ G(J, {
								ref: c,
								"aria-label": r("toolbar.font_color"),
								onClick: () => a(!0),
								icon: /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G(at, {}), /* @__PURE__ */ G("div", {
									className: "ic-fsp-color-bar",
									style: { backgroundColor: X(e.fontColor, n) || "var(--palette-sheet-default-text-color)" }
								})] })
							}),
							/* @__PURE__ */ G(J, {
								ref: l,
								"aria-label": r("toolbar.fill_color"),
								onClick: () => s(!0),
								icon: /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G(Me, {}), /* @__PURE__ */ G("div", {
									className: "ic-fsp-color-bar",
									style: { backgroundColor: X(e.fillColor, n) || "transparent" }
								})] })
							})
						]
					}), /* @__PURE__ */ G(J, {
						icon: /* @__PURE__ */ G(ze, {}),
						"aria-label": r("toolbar.clear_formatting"),
						onClick: () => t(Vi)
					})]
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-fsp-presets-section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-fsp-presets-label",
					children: r("conditional_formatting.default_styles")
				}), /* @__PURE__ */ G("div", {
					className: "ic-fsp-presets",
					children: Hi.map((e, i) => /* @__PURE__ */ G("button", {
						type: "button",
						className: "ic-fsp-preset",
						style: {
							color: X(e.fontColor, n),
							backgroundColor: X(e.fillColor, n) || "#FFFFFF",
							borderColor: X(e.fontColor, n)
						},
						onClick: () => t(e),
						"aria-label": r("conditional_formatting.apply_preset"),
						children: "Aa"
					}, i))
				})]
			}),
			/* @__PURE__ */ G(Zr, {
				color: e.fontColor,
				defaultColor: "",
				defaultSwatchColor: "var(--palette-sheet-default-text-color)",
				title: r("color_picker.default"),
				onChange: (n) => {
					t({
						...e,
						fontColor: n
					}), a(!1);
				},
				onClose: () => a(!1),
				anchorEl: c,
				open: i,
				theme: n
			}),
			/* @__PURE__ */ G(Zr, {
				color: e.fillColor || "#FFFFFF",
				defaultColor: "",
				title: r("color_picker.default"),
				onChange: (n) => {
					t({
						...e,
						fillColor: n
					}), s(!1);
				},
				onClose: () => s(!1),
				anchorEl: l,
				open: o,
				theme: n
			})
		]
	});
}, Wi = ["between", "not_between"], Gi = {
	less_than: "<",
	less_than_or_equal: "≤",
	greater_than: ">",
	greater_than_or_equal: "≥",
	equals: "=",
	does_not_equal: "≠"
}, Ki = [
	"duplicate_values",
	"unique_values",
	"blanks",
	"no_blanks",
	"errors",
	"no_errors"
];
function qi({ ruleType: e, ruleOperator: t, ruleValue: n, ruleValue2: r, resolveValue: i, t: a }) {
	let o = i ?? ((e) => e), s = o(n), c = r && o(r), l = Wi.includes(t);
	if (e === "cell_value") {
		if (l) return s && c ? a(`conditional_formatting.desc_cell_value_${t}`, {
			value: s,
			value2: c
		}) : a("conditional_formatting.desc_cell_value", { op: a(`conditional_formatting.desc_op_${t}`) });
		let e = Gi[t] ?? t;
		return a("conditional_formatting.desc_cell_value", { op: s ? `${e} ${s}` : e });
	}
	if (e === "text") {
		let e = a(`conditional_formatting.desc_op_${t}`, { defaultValue: t });
		return s ? a("conditional_formatting.desc_text_value", {
			op: e,
			value: s
		}) : a("conditional_formatting.desc_text", { op: e });
	}
	return e === "date" ? l && s && c ? a(`conditional_formatting.desc_date_${t}`, {
		value: s,
		value2: c
	}) : a("conditional_formatting.desc_date", { op: a(`conditional_formatting.desc_op_${t}`, { defaultValue: t }) }) : e === "formula" ? s ? a("conditional_formatting.desc_formula", { value: s }) : a("conditional_formatting.rule_type_formula") : e === "color_scale" ? a("conditional_formatting.desc_color_scale") : e === "data_bars" ? a("conditional_formatting.desc_data_bars") : e === "icon_sets" ? a("conditional_formatting.icon_sets_mode_preset") : Ki.includes(e) ? a(`conditional_formatting.rule_type_${e}`) : e;
}
//#endregion
//#region src/components/RightDrawer/ConditionalFormatting/ClassicRule.tsx
var Ji = [
	"cell_value",
	"text",
	"date"
], Yi = ({ onSave: e, onCancel: t, initialValues: n, getSelectedArea: r, applyTo: i, onApplyToChange: a, formatStyle: o, onFormatStyleChange: s, onDescriptionChange: c, resolveValue: u, currentTheme: d }) => {
	let { t: f } = D(), [p, m] = T(n?.ruleType ?? "cell_value"), [h, g] = T(n?.ruleOperator ?? "between"), [_, v] = T(n?.ruleValue ?? ""), [b, x] = T(n?.ruleValue2 ?? ""), [S, C] = T(n?.stopIfTrue ?? !1), E = [
		{
			value: "cell_value",
			label: f("conditional_formatting.rule_type_cell_value")
		},
		{
			value: "text",
			label: f("conditional_formatting.rule_type_text")
		},
		{
			value: "date",
			label: f("conditional_formatting.rule_type_date")
		},
		{
			value: "formula",
			label: f("conditional_formatting.rule_type_formula")
		},
		{
			value: "duplicate_values",
			label: f("conditional_formatting.rule_type_duplicate_values")
		},
		{
			value: "unique_values",
			label: f("conditional_formatting.rule_type_unique_values")
		},
		{
			value: "blanks",
			label: f("conditional_formatting.rule_type_blanks")
		},
		{
			value: "no_blanks",
			label: f("conditional_formatting.rule_type_no_blanks")
		},
		{
			value: "errors",
			label: f("conditional_formatting.rule_type_errors")
		},
		{
			value: "no_errors",
			label: f("conditional_formatting.rule_type_no_errors")
		}
	], O = {
		cell_value: [
			{
				value: "between",
				label: f("conditional_formatting.op_between")
			},
			{
				value: "not_between",
				label: f("conditional_formatting.op_not_between")
			},
			{
				value: "less_than",
				label: f("conditional_formatting.op_less_than")
			},
			{
				value: "less_than_or_equal",
				label: f("conditional_formatting.op_less_than_or_equal")
			},
			{
				value: "greater_than",
				label: f("conditional_formatting.op_greater_than")
			},
			{
				value: "greater_than_or_equal",
				label: f("conditional_formatting.op_greater_than_or_equal")
			},
			{
				value: "equals",
				label: f("conditional_formatting.op_equals")
			},
			{
				value: "does_not_equal",
				label: f("conditional_formatting.op_does_not_equal")
			}
		],
		text: [
			{
				value: "contains",
				label: f("conditional_formatting.op_contains")
			},
			{
				value: "does_not_contain",
				label: f("conditional_formatting.op_does_not_contain")
			},
			{
				value: "begins_with",
				label: f("conditional_formatting.op_begins_with")
			},
			{
				value: "ends_with",
				label: f("conditional_formatting.op_ends_with")
			},
			{
				value: "equals",
				label: f("conditional_formatting.op_equals")
			}
		],
		date: [
			{
				value: "between",
				label: f("conditional_formatting.op_between")
			},
			{
				value: "not_between",
				label: f("conditional_formatting.op_not_between")
			},
			{
				value: "yesterday",
				label: f("conditional_formatting.op_yesterday")
			},
			{
				value: "today",
				label: f("conditional_formatting.op_today")
			},
			{
				value: "tomorrow",
				label: f("conditional_formatting.op_tomorrow")
			},
			{
				value: "in_last_7_days",
				label: f("conditional_formatting.op_in_last_7_days")
			},
			{
				value: "in_next_7_days",
				label: f("conditional_formatting.op_in_next_7_days")
			},
			{
				value: "last_week",
				label: f("conditional_formatting.op_last_week")
			},
			{
				value: "this_week",
				label: f("conditional_formatting.op_this_week")
			},
			{
				value: "next_week",
				label: f("conditional_formatting.op_next_week")
			},
			{
				value: "last_month",
				label: f("conditional_formatting.op_last_month")
			},
			{
				value: "this_month",
				label: f("conditional_formatting.op_this_month")
			},
			{
				value: "next_month",
				label: f("conditional_formatting.op_next_month")
			},
			{
				value: "last_year",
				label: f("conditional_formatting.op_last_year")
			},
			{
				value: "this_year",
				label: f("conditional_formatting.op_this_year")
			},
			{
				value: "next_year",
				label: f("conditional_formatting.op_next_year")
			}
		]
	}, k = Ji.includes(p), A = O[p] ?? [], j = k && ["between", "not_between"].includes(h), M = k && !(p === "date" && !["between", "not_between"].includes(h)), N = p === "formula", ee = !N || !_.trim() ? null : _.trim().startsWith("=") ? l(_.trim().slice(1)).some((e) => e.token === "Illegal") ? f("conditional_formatting.formula_error_invalid") : null : f("conditional_formatting.formula_error_must_start_with_equals"), P = w(!0);
	return y(() => {
		P.current ? P.current = !1 : g(A[0]?.value ?? "");
	}, [A[0]?.value]), y(() => {
		c?.(qi({
			ruleType: p,
			ruleOperator: h,
			ruleValue: _,
			ruleValue2: b,
			resolveValue: u,
			t: f
		}));
	}, [
		p,
		h,
		_,
		b,
		u,
		c,
		f
	]), /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ K("div", {
		className: "ic-edit-rule-content",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-edit-rule-section-title",
					children: f("conditional_formatting.apply_to")
				}), /* @__PURE__ */ K("div", {
					className: "ic-edit-rule-field-wrapper",
					children: [/* @__PURE__ */ G("span", {
						className: "ic-edit-rule-label",
						children: f("conditional_formatting.apply_to_range")
					}), /* @__PURE__ */ G(Y, {
						type: "text",
						placeholder: f("conditional_formatting.apply_to_placeholder"),
						value: i,
						onChange: (e) => a(e.target.value),
						endAdornment: /* @__PURE__ */ G(Z, {
							title: f("conditional_formatting.use_selection"),
							children: /* @__PURE__ */ G(J, {
								size: "sm",
								variant: "secondary",
								icon: /* @__PURE__ */ G(qe, {}),
								"aria-label": f("conditional_formatting.use_selection"),
								onClick: () => a(r()),
								className: "ic-edit-rule-range-button"
							})
						})
					})]
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-edit-rule-section-title",
					children: f("conditional_formatting.format_rules")
				}), /* @__PURE__ */ K("div", {
					className: "ic-edit-rule-condition",
					children: [
						/* @__PURE__ */ G("span", {
							className: "ic-edit-rule-label",
							children: f("conditional_formatting.highlight_cells_if")
						}),
						/* @__PURE__ */ K("div", {
							className: "ic-edit-rule-dropdowns-row",
							children: [/* @__PURE__ */ G($n, {
								value: p,
								options: E,
								onChange: m,
								hideCheck: !0
							}), k && /* @__PURE__ */ G($n, {
								value: h,
								options: A,
								onChange: g,
								hideCheck: !0
							})]
						}),
						N && /* @__PURE__ */ G(Y, {
							type: "text",
							placeholder: f("conditional_formatting.formula_placeholder"),
							value: _,
							error: !!ee,
							helperText: ee ?? void 0,
							onChange: (e) => v(e.target.value)
						}),
						M && (j ? /* @__PURE__ */ K("div", {
							className: "ic-edit-rule-values-row",
							children: [/* @__PURE__ */ G(Y, {
								type: "text",
								placeholder: f("conditional_formatting.rule_value_placeholder"),
								value: _,
								onChange: (e) => v(e.target.value)
							}), /* @__PURE__ */ G(Y, {
								type: "text",
								placeholder: f("conditional_formatting.rule_value_placeholder"),
								value: b,
								onChange: (e) => x(e.target.value)
							})]
						}) : /* @__PURE__ */ G(Y, {
							type: "text",
							placeholder: f("conditional_formatting.rule_value_placeholder"),
							value: _,
							onChange: (e) => v(e.target.value),
							endAdornment: /* @__PURE__ */ G(Z, {
								title: f("conditional_formatting.use_selection"),
								children: /* @__PURE__ */ G(J, {
									size: "sm",
									variant: "secondary",
									icon: /* @__PURE__ */ G(qe, {}),
									"aria-label": f("conditional_formatting.use_selection"),
									onClick: () => v(r()),
									className: "ic-edit-rule-range-button"
								})
							})
						}))
					]
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-edit-rule-section-title",
					children: f("conditional_formatting.format_style")
				}), /* @__PURE__ */ G(Ui, {
					value: o,
					onChange: s,
					currentTheme: d
				})]
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-edit-rule-section",
				children: /* @__PURE__ */ G(Pi, {
					checked: S,
					onChange: C,
					label: f("conditional_formatting.stop_if_true")
				})
			})
		]
	}), /* @__PURE__ */ K("div", {
		className: "ic-edit-rule-footer",
		children: [/* @__PURE__ */ G(q, {
			variant: "secondary",
			onClick: t,
			children: f("conditional_formatting.cancel")
		}), /* @__PURE__ */ G(q, {
			startIcon: /* @__PURE__ */ G(L, {}),
			disabled: !i.trim() || N && (!_.trim() || !!ee) || M && (!_.trim() || j && !b.trim()),
			onClick: () => e({
				applyTo: i,
				ruleType: p,
				ruleOperator: h,
				ruleValue: _,
				ruleValue2: b,
				formatStyle: o,
				stopIfTrue: S
			}),
			children: f("conditional_formatting.apply")
		})]
	})] });
};
//#endregion
//#region src/components/ToggleButton/ToggleButton.tsx
function Xi({ options: e, value: t, onChange: n, multiple: r, size: i = "sm", fullWidth: a = !1, disabled: o = !1, className: s, style: c, ...l }) {
	let u = r ? t : [t], d = (e) => {
		n(r ? t.includes(e) ? t.filter((t) => t !== e) : [...t, e] : e);
	}, f = [
		"ic-toggle-button",
		a && "ic-toggle-button--full-width",
		s
	].filter(Boolean).join(" ");
	return /* @__PURE__ */ G("div", {
		className: f,
		style: c,
		...l,
		children: e.map((e) => {
			let t = {
				size: i,
				variant: "ghost",
				pressed: u.includes(e.value),
				disabled: o || e.disabled,
				onClick: () => d(e.value)
			};
			return e.label === void 0 ? /* @__PURE__ */ G(J, {
				icon: e.icon,
				"aria-label": e["aria-label"] ?? e.value,
				...t
			}, e.value) : /* @__PURE__ */ G(q, {
				startIcon: e.icon,
				"aria-label": e["aria-label"],
				...t,
				children: e.label
			}, e.value);
		})
	});
}
//#endregion
//#region src/components/RightDrawer/ConditionalFormatting/IconSetsRule.tsx
var Zi = [
	{
		id: "dir-3-arrows-color",
		icons: [
			{
				Icon: I,
				color: "#8CB354",
				backendName: "ArrowUp"
			},
			{
				Icon: F,
				color: "#F8CD3D",
				backendName: "ArrowRight"
			},
			{
				Icon: M,
				color: "#EC5753",
				backendName: "ArrowDown"
			}
		]
	},
	{
		id: "dir-3-chevrons-color",
		icons: [
			{
				Icon: se,
				color: "#8CB354",
				backendName: "TriangleUp"
			},
			{
				Icon: Oe,
				color: "#F8CD3D",
				backendName: "FlatRectangle"
			},
			{
				Icon: R,
				color: "#EC5753",
				backendName: "TriangleDown"
			}
		]
	},
	{
		id: "dir-4-arrows-color",
		icons: [
			{
				Icon: I,
				color: "#8CB354",
				backendName: "ArrowUp"
			},
			{
				Icon: te,
				color: "#F8CD3D",
				backendName: "ArrowAngleUp"
			},
			{
				Icon: N,
				color: "#F8CD3D",
				backendName: "ArrowAngleDown"
			},
			{
				Icon: M,
				color: "#EC5753",
				backendName: "ArrowDown"
			}
		]
	},
	{
		id: "dir-5-arrows-color",
		icons: [
			{
				Icon: I,
				color: "#8CB354",
				backendName: "ArrowUp"
			},
			{
				Icon: te,
				color: "#B4D67E",
				backendName: "ArrowAngleUp"
			},
			{
				Icon: F,
				color: "#F8CD3D",
				backendName: "ArrowRight"
			},
			{
				Icon: N,
				color: "#FC9F6E",
				backendName: "ArrowAngleDown"
			},
			{
				Icon: M,
				color: "#EC5753",
				backendName: "ArrowDown"
			}
		]
	}
], Qi = [
	{
		id: "shapes-3-circles-color",
		icons: [
			{
				Icon: ce,
				color: "#EC5753",
				filled: !0,
				backendName: "Circle"
			},
			{
				Icon: ce,
				color: "#F8CD3D",
				filled: !0,
				backendName: "Circle"
			},
			{
				Icon: ce,
				color: "#8CB354",
				filled: !0,
				backendName: "Circle"
			}
		]
	},
	{
		id: "shapes-4-circles-color",
		icons: [
			{
				Icon: ce,
				color: "#333333",
				filled: !0,
				backendName: "Circle"
			},
			{
				Icon: ce,
				color: "#404040",
				filled: !0,
				backendName: "Circle"
			},
			{
				Icon: ce,
				color: "#808080",
				filled: !0,
				backendName: "Circle"
			},
			{
				Icon: ce,
				color: "#D9D9D9",
				filled: !0,
				backendName: "Circle"
			}
		]
	},
	{
		id: "shapes-3-multiple",
		icons: [
			{
				Icon: fe,
				color: "#EC5753",
				filled: !0,
				backendName: "Rhombus"
			},
			{
				Icon: it,
				color: "#F8CD3D",
				filled: !0,
				backendName: "TriangleUpFilled"
			},
			{
				Icon: ce,
				color: "#8CB354",
				filled: !0,
				backendName: "Circle"
			}
		]
	},
	{
		id: "shapes-4-circles",
		icons: [
			{
				Icon: ce,
				color: "#333333",
				filled: !0,
				backendName: "Circle"
			},
			{
				Icon: ce,
				color: "#757575",
				filled: !0,
				backendName: "Circle"
			},
			{
				Icon: ce,
				color: "#EC5753",
				filled: !0,
				backendName: "Circle"
			},
			{
				Icon: ce,
				color: "#FF888A",
				filled: !0,
				backendName: "Circle"
			}
		]
	}
], $i = [
	{
		id: "ind-2-arrows",
		icons: [{
			Icon: I,
			color: "#8CB354",
			backendName: "ArrowUp"
		}, {
			Icon: M,
			color: "#EC5753",
			backendName: "ArrowDown"
		}]
	},
	{
		id: "ind-2-thumbs",
		icons: [{
			Icon: nt,
			color: "#8CB354",
			backendName: "ThumbsUp"
		}, {
			Icon: tt,
			color: "#EC5753",
			backendName: "ThumbsDown"
		}]
	},
	{
		id: "ind-3-checkx",
		icons: [{
			Icon: L,
			color: "#8CB354",
			backendName: "Check"
		}, {
			Icon: lt,
			color: "#EC5753",
			backendName: "Cross"
		}]
	},
	{
		id: "ind-2-triangles",
		icons: [{
			Icon: it,
			color: "#8CB354",
			filled: !0,
			backendName: "TriangleUpFilled"
		}, {
			Icon: it,
			color: "#EC5753",
			filled: !0,
			backendName: "TriangleDownFilled",
			style: { transform: "rotate(180deg)" }
		}]
	},
	{
		id: "ind-3-check-exclaim-x",
		icons: [
			{
				Icon: L,
				color: "#8CB354",
				backendName: "Check"
			},
			{
				Icon: le,
				color: "#F8CD3D",
				backendName: "Exclamation"
			},
			{
				Icon: lt,
				color: "#EC5753",
				backendName: "Cross"
			}
		]
	},
	{
		id: "ind-4-flags",
		icons: [
			{
				Icon: U,
				color: "#8CB354",
				filled: !0,
				backendName: "Flag"
			},
			{
				Icon: U,
				color: "#F8CD3D",
				filled: !0,
				backendName: "Flag"
			},
			{
				Icon: U,
				color: "#EC5753",
				filled: !0,
				backendName: "Flag"
			}
		]
	}
], ea = "#FFD700", ta = "#EC5753", na = [
	{
		id: "rating-3-stars",
		icons: [
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			},
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			},
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			}
		]
	},
	{
		id: "rating-4-stars",
		icons: [
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			},
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			},
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			},
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			}
		]
	},
	{
		id: "rating-5-stars",
		icons: [
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			},
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			},
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			},
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			},
			{
				Icon: Je,
				color: "#FFD700",
				filled: !0,
				backendName: "Star"
			}
		]
	},
	{
		id: "rating-3-hearts",
		icons: [
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			},
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			},
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			}
		]
	},
	{
		id: "rating-4-hearts",
		icons: [
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			},
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			},
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			},
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			}
		]
	},
	{
		id: "rating-5-hearts",
		icons: [
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			},
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			},
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			},
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			},
			{
				Icon: be,
				color: ta,
				filled: !0,
				backendName: "Heart"
			}
		]
	}
], ra = [
	...Zi,
	...Qi,
	...$i
], ia = [
	"min",
	"max",
	"percent",
	"number",
	"percentile",
	"formula"
];
function aa(e) {
	let t = e.length;
	return e.map((e, n) => ({
		operator: ">=",
		value: n < t - 1 ? `${Math.round((t - 1 - n) * 100 / t)}` : "",
		type: "percent",
		color: e.color,
		iconName: e.backendName
	}));
}
function oa(e, t, n = "Star") {
	return Array.from({ length: e }, (r, i) => ({
		operator: ">=",
		value: i < e - 1 ? `${Math.round((e - 1 - i) * 100 / e)}` : "",
		type: "percent",
		color: t,
		iconName: n
	}));
}
var sa = ({ preset: e, selected: t, onClick: n }) => {
	let r = e.icons.length >= 5 ? 12 : 14;
	return /* @__PURE__ */ G("button", {
		type: "button",
		onClick: n,
		"aria-pressed": t,
		className: "ic-fsp-preset ic-is-swatch",
		"aria-label": e.id,
		children: /* @__PURE__ */ G("div", {
			className: "ic-is-swatch-icons",
			children: e.icons.map(({ Icon: e, color: t, filled: n, style: i }, a) => /* @__PURE__ */ G(e, {
				size: r,
				color: t,
				fill: n ? t : "none",
				style: i
			}, t + String(a)))
		})
	});
}, ca = [{
	value: ">=",
	icon: /* @__PURE__ */ G("span", {
		className: "ic-is-op-text",
		children: "≥"
	}),
	"aria-label": "Greater than or equal"
}, {
	value: ">",
	icon: /* @__PURE__ */ G("span", {
		className: "ic-is-op-text",
		children: ">"
	}),
	"aria-label": "Greater than"
}], la = ({ onSave: e, onCancel: t, applyTo: n, onApplyToChange: r, getSelectedArea: i, initialValues: a, onPreviewChange: o, currentTheme: s }) => {
	let { t: c } = D(), l = a?.rating ? "rating" : "preset", [u, d] = T(l), [f, p] = T(a?.presetId ?? $i[0].id), [m, h] = T(a?.rating?.count ?? 3), [g, _] = T(a?.rating?.color ?? ea), [v, b] = T(a?.rating?.icon ?? "Star"), [x, S] = T(!1), C = w(null), [E, O] = T(a?.thresholds ?? (l === "rating" ? oa(a?.rating?.count ?? 3, a?.rating?.color ?? ea, a?.rating?.icon ?? "Star") : aa($i[0].icons))), [k, A] = T(a?.showValue ?? !0), j = w(/* @__PURE__ */ new Map()), [M, N] = T(null), ee = ra.find((e) => e.id === f) ?? $i[0];
	y(() => {
		if (u === "preset") o?.(ee.icons[0]);
		else {
			let e = Xn(v);
			o?.({
				Icon: e.Icon,
				color: X(g, s),
				filled: e.filled
			});
		}
	}, [
		ee,
		u,
		g,
		v,
		o,
		s
	]);
	let P = ia.map((e) => ({
		value: e,
		label: c(`conditional_formatting.color_scale_type_${e}`)
	})), F = (e) => {
		d("preset"), p(e.id), O(aa(e.icons));
	}, I = (e) => {
		let t = e.icons.length, n = e.icons[0].color, r = e.icons[0].backendName;
		d("rating"), h(t), _(n), b(r), O(oa(t, n, r));
	}, te = (e) => {
		_(e), O((t) => t.map((t) => ({
			...t,
			color: e
		}))), S(!1);
	}, ne = (e, t) => {
		O((n) => n.map((n, r) => r === e ? {
			...n,
			...t
		} : n));
	}, re = u === "rating" ? m : ee.icons.length, ie = (e) => e === re - 1 ? c("conditional_formatting.icon_sets_else") : c("conditional_formatting.icon_sets_when_value_is"), R = [
		2,
		3,
		4,
		5
	].map((e) => ({
		key: `count-${e}`,
		label: `${e} ${c("conditional_formatting.icon_sets_icons")}`,
		presets: ra.filter((t) => t.icons.length === e)
	}));
	return /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ K("div", {
		className: "ic-edit-rule-content",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-edit-rule-section-title",
					children: c("conditional_formatting.apply_to")
				}), /* @__PURE__ */ K("div", {
					className: "ic-edit-rule-field-wrapper",
					children: [/* @__PURE__ */ G("span", {
						className: "ic-edit-rule-label",
						children: c("conditional_formatting.apply_to_range")
					}), /* @__PURE__ */ G(Y, {
						type: "text",
						placeholder: c("conditional_formatting.apply_to_placeholder"),
						value: n,
						onChange: (e) => r(e.target.value),
						endAdornment: /* @__PURE__ */ G(Z, {
							title: c("conditional_formatting.use_selection"),
							children: /* @__PURE__ */ G(J, {
								size: "md",
								variant: "secondary",
								icon: /* @__PURE__ */ G(qe, {}),
								"aria-label": c("conditional_formatting.use_selection"),
								onClick: () => r(i()),
								className: "ic-edit-rule-range-button"
							})
						})
					})]
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [
					/* @__PURE__ */ G(Xi, {
						fullWidth: !0,
						size: "md",
						value: u,
						onChange: d,
						options: [{
							value: "preset",
							label: c("conditional_formatting.icon_sets_mode_preset")
						}, {
							value: "rating",
							label: c("conditional_formatting.icon_sets_ratings")
						}]
					}),
					u === "preset" && R.map((e) => /* @__PURE__ */ K("div", {
						className: "ic-fsp-presets-section",
						children: [/* @__PURE__ */ G("div", {
							className: "ic-edit-rule-label",
							children: e.label
						}), /* @__PURE__ */ G("div", {
							className: "ic-is-presets",
							children: e.presets.map((e) => /* @__PURE__ */ G(sa, {
								preset: e,
								selected: f === e.id,
								onClick: () => F(e)
							}, e.id))
						})]
					}, e.key)),
					u === "rating" && [
						3,
						4,
						5
					].map((e) => {
						let t = na.filter((t) => t.icons.length === e);
						return t.length === 0 ? null : /* @__PURE__ */ K("div", {
							className: "ic-fsp-presets-section",
							children: [/* @__PURE__ */ G("div", {
								className: "ic-edit-rule-label",
								children: `${e} ${c("conditional_formatting.icon_sets_icons")}`
							}), /* @__PURE__ */ G("div", {
								className: "ic-is-presets",
								children: t.map((e) => /* @__PURE__ */ G(sa, {
									preset: e,
									selected: m === e.icons.length && g === e.icons[0].color,
									onClick: () => I(e)
								}, e.id))
							})]
						}, e);
					})
				]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-section",
				children: [
					/* @__PURE__ */ G("div", {
						className: "ic-edit-rule-section-title",
						children: c("conditional_formatting.icon_sets_settings")
					}),
					u === "preset" && /* @__PURE__ */ G("div", {
						className: "ic-is-threshold-rows",
						children: E.map((e, t) => {
							let n = t === E.length - 1, r = e.color, i = P;
							return i = t === 0 ? P.filter((e) => e.value !== "max") : n ? P.filter((e) => e.value !== "min") : P.filter((e) => e.value !== "min" && e.value !== "max"), /* @__PURE__ */ K("div", {
								className: "ic-is-threshold-row",
								children: [/* @__PURE__ */ G("div", {
									className: "ic-edit-rule-label",
									children: ie(t)
								}), /* @__PURE__ */ K("div", {
									className: "ic-is-threshold-controls",
									children: [
										/* @__PURE__ */ G(Xi, {
											size: "md",
											options: ca,
											value: e.operator,
											onChange: (e) => ne(t, { operator: e })
										}),
										/* @__PURE__ */ G("div", {
											className: "ic-is-threshold-value-wrap",
											children: /* @__PURE__ */ G(Y, {
												type: "text",
												value: n ? "" : e.value,
												onChange: (e) => ne(t, { value: e.target.value }),
												disabled: n
											})
										}),
										/* @__PURE__ */ G("div", {
											className: "ic-is-threshold-type-wrap",
											children: /* @__PURE__ */ G($n, {
												value: e.type,
												options: i,
												onChange: (e) => ne(t, { type: e }),
												hideCheck: !0,
												disabled: n
											})
										}),
										/* @__PURE__ */ G("div", {
											className: "ic-input-control md ic-cs-color-swatch-wrapper",
											children: /* @__PURE__ */ G(Zn, {
												value: e.iconName,
												color: X(r, s),
												onChange: (e) => ne(t, { iconName: e })
											})
										}),
										/* @__PURE__ */ G("div", {
											className: "ic-input-control md ic-cs-color-swatch-wrapper",
											children: /* @__PURE__ */ G("button", {
												ref: (e) => {
													j.current.set(t, e);
												},
												type: "button",
												className: "ic-cs-color-swatch",
												style: { backgroundColor: X(e.color, s) },
												onClick: () => N(t),
												"aria-label": c("color_picker.title")
											})
										}),
										/* @__PURE__ */ G(Zr, {
											color: e.color,
											defaultColor: X(e.color, s),
											title: c("color_picker.default"),
											onChange: (e) => {
												ne(t, { color: e }), N(null);
											},
											onClose: () => N(null),
											anchorEl: { current: j.current.get(t) ?? null },
											open: M === t,
											theme: s
										})
									]
								})]
							}, ee.id + String(t));
						})
					}),
					u === "rating" && /* @__PURE__ */ G("div", {
						className: "ic-is-threshold-rows",
						children: E.map((e, t) => {
							if (t === E.length - 1) return null;
							let n = P;
							return n = t === 0 ? P.filter((e) => e.value !== "max") : P.filter((e) => e.value !== "min" && e.value !== "max"), /* @__PURE__ */ K("div", {
								className: "ic-is-threshold-row",
								children: [/* @__PURE__ */ G("div", {
									className: "ic-edit-rule-label",
									children: ie(t)
								}), /* @__PURE__ */ K("div", {
									className: "ic-is-threshold-controls",
									children: [
										/* @__PURE__ */ G(Xi, {
											size: "md",
											options: ca,
											value: e.operator,
											onChange: (e) => ne(t, { operator: e })
										}),
										/* @__PURE__ */ G("div", {
											className: "ic-is-threshold-value-wrap",
											children: /* @__PURE__ */ G(Y, {
												type: "text",
												value: e.value,
												onChange: (e) => ne(t, { value: e.target.value })
											})
										}),
										/* @__PURE__ */ G("div", {
											className: "ic-is-threshold-type-wrap",
											children: /* @__PURE__ */ G($n, {
												value: e.type,
												options: n,
												onChange: (e) => ne(t, { type: e }),
												hideCheck: !0
											})
										}),
										/* @__PURE__ */ G("div", {
											className: `ic-input-control md ic-cs-color-swatch-wrapper${t === 0 ? "" : " ic-is-picker-disabled"}`,
											children: /* @__PURE__ */ G(Zn, {
												value: v,
												color: X(g, s),
												onChange: b
											})
										}),
										/* @__PURE__ */ G("div", {
											className: `ic-input-control md ic-cs-color-swatch-wrapper${t === 0 ? "" : " ic-is-picker-disabled"}`,
											children: /* @__PURE__ */ G("button", {
												ref: t === 0 ? C : null,
												type: "button",
												className: "ic-cs-color-swatch",
												style: { backgroundColor: X(g, s) },
												onClick: t === 0 ? () => S(!0) : void 0,
												"aria-label": c("color_picker.title")
											})
										}),
										t === 0 && /* @__PURE__ */ G(Zr, {
											color: g,
											defaultColor: X(g, s),
											title: c("color_picker.default"),
											onChange: te,
											onClose: () => S(!1),
											anchorEl: { current: C.current },
											open: x,
											theme: s
										})
									]
								})]
							}, `rating${String(t)}`);
						})
					}),
					/* @__PURE__ */ K("div", {
						className: "ic-fsp-presets-section",
						children: [/* @__PURE__ */ G("div", {
							className: "ic-edit-rule-label",
							children: c("conditional_formatting.data_bars_preferences")
						}), /* @__PURE__ */ G(Pi, {
							checked: k,
							onChange: A,
							label: c("conditional_formatting.icon_sets_show_value")
						})]
					})
				]
			})
		]
	}), /* @__PURE__ */ K("div", {
		className: "ic-edit-rule-footer",
		children: [/* @__PURE__ */ G(q, {
			variant: "secondary",
			onClick: t,
			children: c("conditional_formatting.cancel")
		}), /* @__PURE__ */ G(q, {
			startIcon: /* @__PURE__ */ G(L, {}),
			disabled: !n.trim(),
			onClick: () => {
				e({
					presetId: f,
					rating: u === "rating" ? {
						count: m,
						icon: v,
						color: g
					} : void 0,
					thresholds: E,
					showValue: k
				});
			},
			children: c("conditional_formatting.apply")
		})]
	})] });
}, ua = {
	bold: !1,
	italic: !1,
	underline: !1,
	strike: !1,
	fontColor: "#D21D21",
	fillColor: "#FBE7E8"
}, da = ({ onSave: e, onCancel: t, initialValues: n, getSelectedArea: r, resolveValue: i, currentTheme: a }) => {
	let { t: o } = D(), s = n?.ruleType === "color_scale" ? "color_scale" : n?.ruleType === "data_bars" ? "data_bars" : n?.ruleType === "icon_sets" ? "icon_sets" : "classic", [c, l] = T(s), [u, d] = T(n?.applyTo ?? ""), [f, p] = T(n?.formatStyle ?? ua), [m, h] = T(""), [g, _] = T(n?.dataBars ?? {
		color: "#6AAB42",
		gradient: !1,
		positiveColor: "#6AAB42",
		negativeColor: "#E05C53",
		hideCellContent: !1,
		minBound: {
			type: "automatic",
			value: ""
		},
		maxBound: {
			type: "automatic",
			value: ""
		}
	}), [v, y] = T(null), [b, x] = T(n?.colorScale ? [
		X(n.colorScale.minimum.color, a),
		X(n.colorScale.midpoint.color, a),
		X(n.colorScale.maximum.color, a)
	] : [
		"#8CB354",
		"#F8CD3D",
		"#EC5753"
	]), S = {
		fontWeight: f.bold ? "bold" : "normal",
		fontStyle: f.italic ? "italic" : "normal",
		textDecoration: [f.underline ? "underline" : "", f.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none",
		color: X(f.fontColor, a) || "var(--palette-sheet-default-text-color)",
		backgroundColor: X(f.fillColor, a) || "transparent"
	}, C = [
		{
			id: "classic",
			label: o("conditional_formatting.tab_classic")
		},
		{
			id: "color_scale",
			label: o("conditional_formatting.tab_color_scale")
		},
		{
			id: "data_bars",
			label: o("conditional_formatting.tab_data_bars")
		},
		{
			id: "icon_sets",
			label: o("conditional_formatting.tab_icon_sets")
		}
	];
	return /* @__PURE__ */ K("div", {
		className: "ic-edit-rule-container",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-edit-rule-header-box",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-edit-rule-header-preview",
					style: c === "color_scale" ? { background: ci(b) } : c === "data_bars" ? { position: "relative" } : c === "icon_sets" ? { background: "var(--palette-common-white)" } : S,
					children: c === "data_bars" ? /* @__PURE__ */ G(Li, {
						color: g.color,
						gradient: g.gradient
					}) : c === "icon_sets" && v ? /* @__PURE__ */ G(v.Icon, {
						size: 18,
						color: v.color,
						fill: v.filled ? v.color : "none"
					}) : c !== "color_scale" && "Aa"
				}), /* @__PURE__ */ G("span", {
					className: "ic-edit-rule-header-box-text",
					children: c === "classic" && m ? m : C.find((e) => e.id === c)?.label
				})]
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-edit-rule-tabs",
				children: C.map(({ id: e, label: t }) => /* @__PURE__ */ G(q, {
					variant: "ghost",
					size: "sm",
					className: `ic-edit-rule-tab${c === e ? " ic-edit-rule-tab--active" : ""}`,
					onClick: () => l(e),
					children: t
				}, e))
			}),
			c === "classic" && /* @__PURE__ */ G(Yi, {
				onSave: e,
				onCancel: t,
				initialValues: n,
				getSelectedArea: r,
				applyTo: u,
				onApplyToChange: d,
				formatStyle: f,
				onFormatStyleChange: p,
				onDescriptionChange: h,
				resolveValue: i,
				currentTheme: a
			}),
			c === "color_scale" && /* @__PURE__ */ G(di, {
				onSave: (t) => e({
					applyTo: u,
					ruleType: "color_scale",
					ruleOperator: "",
					ruleValue: "",
					ruleValue2: "",
					formatStyle: ua,
					colorScale: t
				}),
				onCancel: t,
				applyTo: u,
				onApplyToChange: d,
				initialValues: n?.colorScale,
				onPreviewChange: x,
				getSelectedArea: r,
				currentTheme: a
			}),
			c === "data_bars" && /* @__PURE__ */ G(Bi, {
				onSave: (t) => e({
					applyTo: u,
					ruleType: "data_bars",
					ruleOperator: "",
					ruleValue: "",
					ruleValue2: "",
					formatStyle: ua,
					dataBars: t
				}),
				onCancel: t,
				applyTo: u,
				onApplyToChange: d,
				getSelectedArea: r,
				initialValues: n?.dataBars,
				onPreviewChange: _,
				currentTheme: a
			}),
			c === "icon_sets" && /* @__PURE__ */ G(la, {
				onSave: (t) => e({
					applyTo: u,
					ruleType: "icon_sets",
					ruleOperator: "",
					ruleValue: "",
					ruleValue2: "",
					formatStyle: ua,
					iconSets: t
				}),
				applyTo: u,
				onApplyToChange: d,
				getSelectedArea: r,
				initialValues: n?.iconSets,
				onCancel: t,
				onPreviewChange: y,
				currentTheme: a
			})
		]
	});
}, fa = "ic-cf-list-item--moving", pa = "ic-cf-slide", ma = ({ onClose: e, getSelectedArea: t, sheet: n, onUpdate: r, model: i, currentTheme: a }) => {
	let [o, s] = T(null), [c, l] = T(!1), [u, d] = T(""), [f, p] = T("sheet"), m = w(null), h = w(!1), { t: g } = D();
	function _() {
		let e = t();
		return (e.split("!").pop() ?? e).replace(/\$/g, "");
	}
	let v = [{
		value: "sheet",
		label: g("conditional_formatting.filter_this_sheet")
	}, {
		value: "selection",
		label: g("conditional_formatting.filter_selection")
	}], y = (e) => {
		if (!e.trim()) return e;
		let t = wn(i, e);
		if (t) {
			let [e, n, r] = t, a = i.getFormattedCellValue(e, n, r);
			return a === "" ? "\"\"" : a;
		}
		return e;
	}, b = i.getConditionalFormattingList(n).flatMap((e) => {
		let t = e.index, r = Ni(e);
		if (!r) return [];
		let a = r.ruleType ?? "cell_value", o = xi(yi(a) ? i.getDxfForConditionalFormatting(n, t) : null);
		return [{
			...r,
			id: `${t}`,
			applyTo: e.range,
			ruleType: a,
			ruleOperator: r.ruleOperator ?? "",
			ruleValue: r.ruleValue ?? "",
			ruleValue2: r.ruleValue2 ?? "",
			formatStyle: o
		}];
	}), x = (e) => {
		let t = e.applyTo.split(/\s+/)[0], n = En(t);
		if (n) {
			let { minCol: e, maxCol: t, minRow: r, maxRow: a } = n;
			i.setSelectedCell(r, e), i.setSelectedRange(r, e, a, t);
		}
		r();
	}, S = c || o !== null, C = () => {
		l(!1), s(null);
	}, E = (e) => {
		let t = Mi(e);
		if (!t) return;
		let a = e.applyTo;
		kn(a) && (o ? (i.updateConditionalFormatting(n, parseInt(o.id, 10), a, t), s(null)) : (i.addConditionalFormatting(n, a, t), l(!1)), r());
	}, O = (e) => {
		i.deleteConditionalFormatting(n, parseInt(e, 10)), r();
	}, k = (e) => {
		let t = Mi(e);
		t && (i.addConditionalFormatting(n, e.applyTo, t), r());
	}, A = (e) => m.current?.querySelector(`[data-rule-id="${e}"]`) ?? null, j = (e, t) => {
		if (h.current) return;
		let a = parseInt(e.id, 10), o = () => {
			t ? i.lowerConditionalFormattingPriority(n, a) : i.raiseConditionalFormattingPriority(n, a), r();
		}, s = b.findIndex((t) => t.id === e.id), c = b[t ? s + 1 : s - 1], l = A(e.id), u = c ? A(c.id) : null, d = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		if (!l || !u || d) {
			o();
			return;
		}
		let f = l.getBoundingClientRect().height, p = u.getBoundingClientRect().height, m = t ? p : -p, g = t ? -f : f, _ = !1, v = () => {
			if (!_) {
				_ = !0, clearTimeout(x), l.removeEventListener("animationend", y), l.removeEventListener("animationcancel", y), h.current = !1, dt(o);
				for (let e of [l, u]) e.classList.remove(fa), e.style.removeProperty("--ic-cf-shift");
			}
		}, y = (e) => {
			e.target === l && e.animationName === pa && v();
		};
		l.addEventListener("animationend", y), l.addEventListener("animationcancel", y);
		let x = setTimeout(v, 300);
		h.current = !0, l.style.setProperty("--ic-cf-shift", `${m}px`), u.style.setProperty("--ic-cf-shift", `${g}px`), l.classList.add(fa), u.classList.add(fa);
	};
	if (S) {
		let t = g(o ? "conditional_formatting.edit_rule" : "conditional_formatting.add_new_rule");
		return /* @__PURE__ */ K("div", {
			className: "ic-cf-container",
			children: [/* @__PURE__ */ K("div", {
				className: "ic-cf-edit-header",
				children: [
					/* @__PURE__ */ G(Z, {
						title: g("conditional_formatting.back_to_list"),
						children: /* @__PURE__ */ G(J, {
							icon: /* @__PURE__ */ G(P, {}),
							onClick: C,
							"aria-label": g("conditional_formatting.back_to_list")
						})
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-cf-edit-header-title",
						children: t
					}),
					/* @__PURE__ */ G(Z, {
						title: g("right_drawer.close"),
						children: /* @__PURE__ */ G(J, {
							icon: /* @__PURE__ */ G(lt, {}),
							onClick: e,
							"aria-label": g("right_drawer.close")
						})
					})
				]
			}), /* @__PURE__ */ G("div", {
				className: "ic-cf-content",
				children: /* @__PURE__ */ G(da, {
					onSave: E,
					onCancel: C,
					getSelectedArea: _,
					resolveValue: y,
					currentTheme: a,
					initialValues: o ?? {
						applyTo: _(),
						ruleType: "cell_value",
						ruleOperator: "between",
						ruleValue: "",
						ruleValue2: "",
						formatStyle: {
							bold: !1,
							italic: !1,
							underline: !1,
							strike: !1,
							fontColor: "#D21D21",
							fillColor: "#FBE7E8"
						}
					}
				})
			})]
		});
	}
	let M = b.filter((e) => {
		if (f === "selection" && !On(_(), e.applyTo)) return !1;
		if (!u.trim()) return !0;
		let t = u.trim().toLowerCase();
		return e.applyTo.toLowerCase().includes(t) || qi({
			...e,
			resolveValue: y,
			t: g
		}).toLowerCase().includes(t);
	});
	return /* @__PURE__ */ K("div", {
		className: "ic-cf-container",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-cf-header",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-cf-header-title",
					children: g("conditional_formatting.title")
				}), /* @__PURE__ */ G(Z, {
					title: g("right_drawer.close"),
					children: /* @__PURE__ */ G(J, {
						icon: /* @__PURE__ */ G(lt, {}),
						onClick: e,
						"aria-label": g("right_drawer.close")
					})
				})]
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-cf-content",
				children: b.length === 0 ? /* @__PURE__ */ K("div", {
					className: "ic-cf-empty-state",
					children: [
						/* @__PURE__ */ G("div", {
							className: "ic-cf-icon-wrapper",
							children: /* @__PURE__ */ G(je, {})
						}),
						g("conditional_formatting.empty_message1"),
						/* @__PURE__ */ G("br", {}),
						g("conditional_formatting.empty_message2")
					]
				}) : /* @__PURE__ */ K("div", {
					className: "ic-cf-list-container",
					children: [/* @__PURE__ */ K("div", {
						className: "ic-cf-search-container",
						children: [/* @__PURE__ */ G(Y, {
							type: "text",
							size: "sm",
							value: u,
							onChange: (e) => d(e.target.value),
							placeholder: g("conditional_formatting.search_placeholder"),
							startAdornment: /* @__PURE__ */ G(He, {})
						}), /* @__PURE__ */ K("div", {
							className: "ic-cf-filter",
							children: [/* @__PURE__ */ G("span", { children: g("conditional_formatting.filter_label") }), /* @__PURE__ */ G($n, {
								size: "sm",
								variant: "ghost",
								value: f,
								options: v,
								onChange: p
							})]
						})]
					}), /* @__PURE__ */ G("div", {
						ref: m,
						className: "ic-cf-list-body",
						onMouseDown: (e) => e.preventDefault(),
						children: M.length === 0 ? /* @__PURE__ */ K("div", {
							className: "ic-cf-empty-state",
							children: [/* @__PURE__ */ G("div", {
								className: "ic-cf-icon-wrapper",
								children: /* @__PURE__ */ G(Ue, {})
							}), g("conditional_formatting.no_search_results")]
						}) : M.map((e) => {
							let t = On(_(), e.applyTo), n = {
								color: X(e.formatStyle.fontColor, a) || "var(--palette-sheet-default-text-color)",
								backgroundColor: X(e.formatStyle.fillColor, a) || "transparent",
								fontWeight: e.formatStyle.bold ? "bold" : "normal",
								fontStyle: e.formatStyle.italic ? "italic" : "normal",
								textDecoration: [e.formatStyle.underline ? "underline" : "", e.formatStyle.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none"
							}, r = e.ruleType === "color_scale", i = r && e.colorScale ? ci(e.colorScale.midpoint.type === "none" ? [X(e.colorScale.minimum.color, a), X(e.colorScale.maximum.color, a)] : [
								X(e.colorScale.minimum.color, a),
								X(e.colorScale.midpoint.color, a),
								X(e.colorScale.maximum.color, a)
							]) : void 0, o = e.ruleType === "data_bars", c = e.ruleType === "icon_sets", l = c && !!e.iconSets?.rating, u = (() => {
								if (c && e.iconSets) {
									if (e.iconSets.rating) {
										let t = Xn(e.iconSets.rating.icon);
										return {
											Icon: t.Icon,
											color: X(e.iconSets.rating.color, a),
											filled: t.filled,
											backendName: e.iconSets.rating.icon
										};
									}
									return ra.find((t) => t.id === e.iconSets?.presetId)?.icons[0];
								}
							})();
							return /* @__PURE__ */ K("div", {
								"data-rule-id": e.id,
								className: `ic-cf-list-item${t ? " ic-cf-list-item--selected" : ""}`,
								tabIndex: 0,
								onClick: () => x(e),
								onKeyDown: (t) => {
									(t.key === "Enter" || t.key === " ") && (t.preventDefault(), x(e));
								},
								children: [
									/* @__PURE__ */ K("div", {
										className: "ic-cf-list-item-order-stack",
										children: [
											/* @__PURE__ */ G(J, {
												className: "ic-cf-list-item-order-chevron",
												icon: /* @__PURE__ */ G(se, {}),
												disabled: b[0]?.id === e.id,
												onClick: (t) => {
													t.stopPropagation(), j(e, !1);
												},
												"aria-label": g("conditional_formatting.move_up")
											}),
											/* @__PURE__ */ G("div", {
												className: "ic-cf-list-item-order",
												children: b.findIndex((t) => t.id === e.id) + 1
											}),
											/* @__PURE__ */ G(J, {
												className: "ic-cf-list-item-order-chevron",
												icon: /* @__PURE__ */ G(R, {}),
												disabled: b[b.length - 1]?.id === e.id,
												onClick: (t) => {
													t.stopPropagation(), j(e, !0);
												},
												"aria-label": g("conditional_formatting.move_down")
											})
										]
									}),
									/* @__PURE__ */ G("div", {
										className: "ic-cf-list-item-preview",
										style: r ? { background: i } : o ? {
											position: "relative",
											overflow: "hidden"
										} : c ? { background: "var(--palette-common-white)" } : n,
										children: o && e.dataBars ? /* @__PURE__ */ G(Li, {
											color: X(e.dataBars.positiveColor, a) || e.dataBars.color,
											gradient: e.dataBars.gradient
										}) : c && u ? /* @__PURE__ */ G(u.Icon, {
											size: 16,
											color: u.color,
											fill: u.filled ? u.color : "none"
										}) : !r && "Aa"
									}),
									/* @__PURE__ */ K("div", {
										className: "ic-cf-list-item-text",
										children: [/* @__PURE__ */ G("div", {
											className: "ic-cf-list-item-rule",
											children: l ? g("conditional_formatting.icon_sets_ratings") : qi({
												...e,
												resolveValue: y,
												t: g
											})
										}), /* @__PURE__ */ G("div", {
											className: "ic-cf-list-item-range",
											children: e.applyTo || "—"
										})]
									}),
									/* @__PURE__ */ K("div", {
										className: "ic-cf-list-item-icons",
										children: [
											/* @__PURE__ */ G(Z, {
												title: g("conditional_formatting.edit_rule"),
												children: /* @__PURE__ */ G(J, {
													icon: /* @__PURE__ */ G(Pe, {}),
													onClick: (t) => {
														t.stopPropagation(), s(e);
													},
													"aria-label": g("conditional_formatting.edit_rule")
												})
											}),
											/* @__PURE__ */ G(Z, {
												title: g("conditional_formatting.duplicate_rule"),
												children: /* @__PURE__ */ G(J, {
													icon: /* @__PURE__ */ G(V, {}),
													onClick: (t) => {
														t.stopPropagation(), k(e);
													},
													"aria-label": g("conditional_formatting.duplicate_rule")
												})
											}),
											/* @__PURE__ */ G(Z, {
												title: g("conditional_formatting.delete_rule"),
												children: /* @__PURE__ */ G(J, {
													icon: /* @__PURE__ */ G(rt, {}),
													onClick: (t) => {
														t.stopPropagation(), O(e.id);
													},
													"aria-label": g("conditional_formatting.delete_rule")
												})
											})
										]
									})
								]
							}, e.id);
						})
					})]
				})
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-cf-footer",
				children: /* @__PURE__ */ G(q, {
					startIcon: /* @__PURE__ */ G(Ie, {}),
					onClick: () => l(!0),
					children: g("conditional_formatting.new")
				})
			})
		]
	});
}, ha = g(function({ size: e = "md", label: t, helperText: n, error: r = !1, disabled: i = !1, required: a, endAdornment: o, id: s, className: c, style: l, ...u }, d) {
	let f = b(), p = s ?? f, m = `${p}-helper`, h = [
		"ic-textarea-control",
		`${e}`,
		r && "is-error",
		i && "is-disabled",
		o && "has-end"
	].filter(Boolean).join(" ");
	return /* @__PURE__ */ K("div", {
		className: ["ic-textarea", c].filter(Boolean).join(" "),
		style: l,
		children: [
			t && /* @__PURE__ */ G("label", {
				htmlFor: p,
				"data-required": a || void 0,
				children: t
			}),
			/* @__PURE__ */ K("div", {
				className: h,
				children: [/* @__PURE__ */ G("textarea", {
					ref: d,
					id: p,
					disabled: i,
					required: a,
					"aria-invalid": r || void 0,
					"aria-describedby": n ? m : void 0,
					onKeyDown: (e) => e.stopPropagation(),
					onClick: (e) => e.stopPropagation(),
					onPaste: (e) => e.stopPropagation(),
					onCopy: (e) => e.stopPropagation(),
					onCut: (e) => e.stopPropagation(),
					spellCheck: !1,
					...u
				}), o && /* @__PURE__ */ G("span", {
					className: "ic-textarea-end-adornment",
					children: o
				})]
			}),
			n && /* @__PURE__ */ G("p", {
				id: m,
				children: n
			})
		]
	});
});
ha.displayName = "Textarea";
//#endregion
//#region src/components/RightDrawer/NamedRanges/EditNamedRange.tsx
function ga(e) {
	return e.startsWith("Name: ") ? {
		formulaError: "",
		nameError: e.slice(6)
	} : e.startsWith("Formula: ") ? {
		formulaError: e.slice(9),
		nameError: ""
	} : e.startsWith("Scope: ") ? {
		formulaError: "",
		nameError: e.slice(7)
	} : {
		formulaError: e,
		nameError: ""
	};
}
var _a = ({ name: e, scope: t, formula: n, onSave: r, onCancel: i, editingDefinedName: a, model: o }) => {
	let { t: s } = D(), [c, l] = T((() => {
		if (e) return e;
		let n = s("name_manager_dialog.default_range_prefix"), r = 1, i = `${n}${r}`, a = o.getWorksheetsProperties().findIndex((e) => e.name === t), c = a >= 0 ? a : void 0, l = o.getDefinedNameList();
		for (; l.some((e) => e.name === i && e.scope === c);) r++, i = `${n}${r}`;
		return i;
	})()), u = o.getWorksheetsProperties(), [d, f] = T(() => u.find((e) => e.name === t)?.sheet_id), p = u.find((e) => e.sheet_id === d)?.name ?? "[Global]", [m, h] = T(n), [g, _] = T(""), [v, x] = T(""), S = (e) => p === e, C = b();
	y(() => {
		let e = setTimeout(() => {
			let e = o.getWorksheetsProperties().findIndex((e) => e.name === p), t = e >= 0 ? e : null;
			try {
				o.isValidDefinedName(c, t, m);
			} catch (e) {
				let t = e.message;
				if (a && t.includes("already exists")) {
					_(""), x("");
					return;
				}
				let { nameError: n, formulaError: r } = ga(t);
				_(n), x(r);
				return;
			}
			_(""), x("");
		}, 300);
		return () => clearTimeout(e);
	}, [
		c,
		p,
		m,
		o,
		a
	]);
	let w = g !== "" || v !== "", E = () => {
		if (w) return;
		let e = r(c.trim(), p, m);
		e.nameError && _(e.nameError), e.formulaError && x(e.formulaError);
	}, O = (e) => {
		e.stopPropagation(), (e.metaKey || e.ctrlKey) && e.key === "Enter" && (e.preventDefault(), E());
	};
	return /* @__PURE__ */ K("div", {
		className: "ic-edit-range-container",
		onKeyDown: O,
		children: [/* @__PURE__ */ K("div", {
			className: "ic-edit-range-content-area",
			children: [/* @__PURE__ */ K("div", {
				className: "ic-edit-range-header-box",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-edit-range-header-icon",
					children: /* @__PURE__ */ G($e, {})
				}), /* @__PURE__ */ G("span", {
					className: "ic-edit-range-header-box-text",
					children: c || s("name_manager_dialog.new_named_range")
				})]
			}), /* @__PURE__ */ K("div", {
				className: "ic-edit-range-styled-box",
				children: [
					/* @__PURE__ */ G(Y, {
						id: C,
						autoFocus: !0,
						type: "text",
						label: s("name_manager_dialog.range_name"),
						placeholder: s("name_manager_dialog.enter_range_name"),
						value: c,
						error: !!g,
						helperText: g,
						onChange: (e) => l(e.target.value),
						onKeyDown: O
					}),
					/* @__PURE__ */ G($n, {
						label: s("name_manager_dialog.scope_label"),
						helperText: s("name_manager_dialog.scope_helper"),
						value: p,
						onChange: (e) => f(u.find((t) => t.name === e)?.sheet_id),
						options: [{
							value: "[Global]",
							label: /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G("span", {
								className: S("[Global]") ? "ic-edit-range-menu-span ic-edit-range-menu-span--selected" : "ic-edit-range-menu-span",
								children: s("name_manager_dialog.workbook")
							}), /* @__PURE__ */ G("span", {
								className: "ic-edit-range-menu-span-grey",
								children: ` ${s("name_manager_dialog.global")}`
							})] }),
							triggerLabel: /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G("span", {
								className: "ic-edit-range-menu-span",
								children: s("name_manager_dialog.workbook")
							}), /* @__PURE__ */ G("span", {
								className: "ic-edit-range-menu-span-grey",
								children: ` ${s("name_manager_dialog.global")}`
							})] })
						}, ...u.map((e) => ({
							value: e.name,
							label: /* @__PURE__ */ G("span", {
								className: S(e.name) ? "ic-edit-range-menu-span ic-edit-range-menu-span--selected" : "ic-edit-range-menu-span",
								children: e.name
							}),
							triggerLabel: /* @__PURE__ */ G("span", { children: e.name })
						}))]
					}),
					/* @__PURE__ */ G(ha, {
						label: s("name_manager_dialog.refers_to"),
						placeholder: s("name_manager_dialog.enter_formula"),
						value: m,
						error: !!v,
						helperText: v || void 0,
						onChange: (e) => {
							h(e.target.value), x("");
						},
						onKeyDown: O,
						endAdornment: /* @__PURE__ */ G(Z, {
							title: s("name_manager_dialog.use_selection"),
							children: /* @__PURE__ */ G(J, {
								size: "sm",
								variant: "secondary",
								icon: /* @__PURE__ */ G(qe, {}),
								"aria-label": s("name_manager_dialog.use_selection"),
								className: "ic-edit-range-range-button",
								onClick: () => {
									let e = o.getWorksheetsProperties().map((e) => e.name), t = fn(o.getSelectedView(), e);
									h(t);
								}
							})
						})
					})
				]
			})]
		}), /* @__PURE__ */ K("div", {
			className: "ic-edit-range-footer",
			children: [/* @__PURE__ */ G(q, {
				variant: "secondary",
				onClick: i,
				children: s("name_manager_dialog.cancel")
			}), /* @__PURE__ */ G(q, {
				startIcon: /* @__PURE__ */ G(L, {}),
				disabled: w,
				onClick: E,
				children: s("name_manager_dialog.apply")
			})]
		})]
	});
}, va = (e) => e.trim().replace(/['"]/g, ""), ya = ({ onClose: e, getSelectedArea: t, model: n, onUpdate: r }) => {
	let [i, a] = T(null), [o, s] = T(!1), [c, l] = T("[all]"), [u, d] = T(""), f = w(null), { t: p } = D(), m = !i && !o;
	y(() => {
		m && f.current?.focus();
	}, [m]);
	let h = (e) => {
		a(e), s(!1);
	}, g = () => {
		s(!0), a(null);
	}, _ = () => {
		a(null), s(!1);
	}, v = (e, t, c) => {
		let l = n.getWorksheetsProperties();
		if (o) {
			let i = l.findIndex((e) => e.name === t), a = i >= 0 ? i : null;
			try {
				return n.newDefinedName(e, a, c), s(!1), r(), {
					formulaError: "",
					nameError: ""
				};
			} catch (e) {
				return e instanceof Error ? ga(e.message) : {
					formulaError: "",
					nameError: `${e}`
				};
			}
		}
		{
			if (!i) return {
				formulaError: "",
				nameError: ""
			};
			let o = l.findIndex((e) => e.name === t), s = o >= 0 ? o : null;
			try {
				return n.updateDefinedName(i.name, i.scope ?? null, e, s, c), a(null), r(), {
					formulaError: "",
					nameError: ""
				};
			} catch (e) {
				return e instanceof Error ? ga(e.message) : {
					formulaError: "",
					nameError: `${e}`
				};
			}
		}
	};
	if (i || o) {
		let r = "", a = "[Global]", s = "";
		if (i) {
			r = i.name;
			let e = n.getWorksheetsProperties();
			a = i.scope == null ? "[Global]" : e[i.scope]?.name || "[unknown]", s = i.formula;
		} else o && (s = t());
		let c = p(o ? "name_manager_dialog.add_new_range" : "name_manager_dialog.edit_range");
		return /* @__PURE__ */ K("div", {
			className: "ic-named-ranges-container",
			children: [/* @__PURE__ */ K("div", {
				className: "ic-named-ranges-edit-header",
				children: [
					/* @__PURE__ */ G(Z, {
						title: p("name_manager_dialog.back_to_list"),
						children: /* @__PURE__ */ G(J, {
							icon: /* @__PURE__ */ G(P, {}),
							onClick: _,
							"aria-label": p("name_manager_dialog.back_to_list")
						})
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-named-ranges-edit-header-title",
						children: c
					}),
					/* @__PURE__ */ G(Z, {
						title: p("right_drawer.close"),
						children: /* @__PURE__ */ G(J, {
							icon: /* @__PURE__ */ G(lt, {}),
							onClick: e,
							"aria-label": p("right_drawer.close")
						})
					})
				]
			}), /* @__PURE__ */ G("div", {
				className: "ic-named-ranges-content",
				children: /* @__PURE__ */ G(_a, {
					name: r,
					scope: a,
					formula: s,
					onSave: v,
					onCancel: _,
					editingDefinedName: i,
					model: n
				})
			})]
		});
	}
	let b = t(), x = n.getDefinedNameList(), S = n.getSelectedView().sheet, C = [
		{
			value: "[all]",
			label: p("name_manager_dialog.scope_filter_all")
		},
		{
			value: "[global]",
			label: p("name_manager_dialog.scope_filter_global")
		},
		{
			value: "[current]",
			label: p("name_manager_dialog.scope_filter_current")
		}
	], E = x.filter((e) => {
		if (c === "[global]" && e.scope != null || c === "[current]" && e.scope !== S) return !1;
		if (u.trim()) {
			let t = u.trim().toLowerCase(), r = n.getWorksheetsProperties(), i = e.scope == null ? p("name_manager_dialog.scope_filter_global") : r[e.scope]?.name ?? "";
			return e.name.toLowerCase().includes(t) || i.toLowerCase().includes(t);
		}
		return !0;
	}), O = (e) => {
		let t = wn(n, e);
		if (t) {
			let [e, r, i, a, o] = t;
			n.setSelectedSheet(e), n.setSelectedCell(r, i), n.setSelectedRange(r, i, a, o);
		}
		r();
	};
	return /* @__PURE__ */ K("div", {
		className: "ic-named-ranges-container",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-named-ranges-header",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-named-ranges-header-title",
					children: p("name_manager_dialog.title")
				}), /* @__PURE__ */ G(Z, {
					title: p("right_drawer.close"),
					children: /* @__PURE__ */ G(J, {
						icon: /* @__PURE__ */ G(lt, {}),
						onClick: e,
						"aria-label": p("right_drawer.close")
					})
				})]
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-named-ranges-content",
				children: x.length === 0 ? /* @__PURE__ */ K("div", {
					className: "ic-named-ranges-empty-state-message",
					children: [
						/* @__PURE__ */ G("div", {
							className: "ic-named-ranges-icon-wrapper",
							children: /* @__PURE__ */ G(je, {})
						}),
						p("name_manager_dialog.empty_message1"),
						/* @__PURE__ */ G("br", {}),
						p("name_manager_dialog.empty_message2")
					]
				}) : /* @__PURE__ */ K("div", {
					className: "ic-named-ranges-list-container",
					children: [/* @__PURE__ */ K("div", {
						className: "ic-named-ranges-search-container",
						children: [/* @__PURE__ */ G(Y, {
							ref: f,
							type: "text",
							size: "sm",
							value: u,
							onChange: (e) => d(e.target.value),
							placeholder: p("name_manager_dialog.search_placeholder"),
							startAdornment: /* @__PURE__ */ G(He, {})
						}), /* @__PURE__ */ K("div", {
							className: "ic-named-ranges-scope-filter",
							children: [/* @__PURE__ */ G("span", { children: p("name_manager_dialog.scope_label") }), /* @__PURE__ */ G($n, {
								size: "sm",
								variant: "ghost",
								value: c,
								options: C,
								onChange: l
							})]
						})]
					}), /* @__PURE__ */ K("div", {
						className: "ic-named-ranges-list-body",
						onMouseDown: (e) => e.preventDefault(),
						children: [E.length === 0 ? /* @__PURE__ */ K("div", {
							className: "ic-named-ranges-empty-state-message",
							children: [/* @__PURE__ */ G("div", {
								className: "ic-named-ranges-icon-wrapper",
								children: /* @__PURE__ */ G(Ue, {})
							}), p("name_manager_dialog.no_search_results")]
						}) : null, E.map((e) => {
							let t = n.getWorksheetsProperties(), i = e.scope == null ? "[Global]" : t[e.scope]?.name || "[Unknown]", a = b !== null && va(e.formula) === va(b);
							return /* @__PURE__ */ K("div", {
								className: `ic-named-ranges-list-item ${a ? "ic-named-ranges-list-item--selected" : ""}`,
								tabIndex: 0,
								onClick: () => {
									let t = e.formula, i = wn(n, t);
									if (i) {
										let [e, t, r, a, o] = i;
										n.setSelectedSheet(e), n.setSelectedCell(t, r), n.setSelectedRange(t, r, a, o);
									}
									r();
								},
								onKeyDown: (t) => {
									(t.key === "Enter" || t.key === " ") && (t.preventDefault(), O(e.formula));
								},
								children: [/* @__PURE__ */ K("div", {
									className: "ic-named-ranges-list-item-text",
									children: [
										/* @__PURE__ */ G("div", {
											className: "ic-named-ranges-name-text",
											children: e.name
										}),
										/* @__PURE__ */ G("div", {
											className: "ic-named-ranges-scope-text",
											children: i
										}),
										/* @__PURE__ */ G("div", {
											className: "ic-named-ranges-formula-text",
											children: e.formula
										})
									]
								}), /* @__PURE__ */ K("div", {
									className: "ic-named-ranges-icons-wrapper",
									children: [/* @__PURE__ */ G(Z, {
										title: p("name_manager_dialog.edit"),
										children: /* @__PURE__ */ G(J, {
											icon: /* @__PURE__ */ G(Pe, {}),
											onClick: (t) => {
												t.stopPropagation(), h(e);
											},
											"aria-label": p("name_manager_dialog.edit")
										})
									}), /* @__PURE__ */ G(Z, {
										title: p("name_manager_dialog.delete"),
										children: /* @__PURE__ */ G(J, {
											icon: /* @__PURE__ */ G(rt, {}),
											onClick: (t) => {
												t.stopPropagation(), n.deleteDefinedName(e.name, e.scope ?? null), r();
											},
											"aria-label": p("name_manager_dialog.delete")
										})
									})]
								})]
							}, `${e.name}-${e.scope}`);
						})]
					})]
				})
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-named-ranges-footer",
				children: /* @__PURE__ */ G(q, {
					startIcon: /* @__PURE__ */ G(Ie, {}),
					onClick: g,
					children: p("name_manager_dialog.new")
				})
			})
		]
	});
}, ba = [
	{
		value: t.Thin,
		previewClassName: "thin"
	},
	{
		value: t.Medium,
		previewClassName: "medium"
	},
	{
		value: t.Thick,
		previewClassName: "thick"
	},
	{
		value: t.Double,
		previewClassName: "double"
	},
	{
		value: t.Dotted,
		previewClassName: "dotted"
	},
	{
		value: t.MediumDashed,
		previewClassName: "medium-dashed"
	},
	{
		value: t.SlantDashDot,
		previewClassName: "slant-dash-dot"
	},
	{
		value: t.MediumDashDot,
		previewClassName: "medium-dash-dot"
	},
	{
		value: t.MediumDashDotDot,
		previewClassName: "medium-dash-dot-dot"
	}
];
function xa({ value: e, onSelect: t }) {
	return /* @__PURE__ */ G("div", {
		className: "ic-line-style-picker",
		children: ba.map((n) => /* @__PURE__ */ G("button", {
			type: "button",
			className: e === n.value ? "ic-border-picker__button selected" : "ic-border-picker__button",
			onClick: () => t(n.value),
			children: /* @__PURE__ */ G("span", { className: `ic-line-preview ${n.previewClassName}` })
		}, n.value))
	});
}
//#endregion
//#region src/components/FormatMenu/formatUtil.ts
function Sa(e) {
	if (e === "general") return "#,##0.000";
	let t = e.replace(/\.0/g, ".00");
	return t.includes(".") ? t : t.includes("0") ? t.replace(/0/g, "0.0") : t.includes("#") ? t.replace(/#([^#,]|$)/g, "0.0$1") : e;
}
function Ca(e) {
	if (e === "general") return "#,##0.0";
	let t = e.replace(/\.0/g, ".");
	return t = t.replace(/0\.([^0]|$)/, "0$1"), t;
}
var Q = /* @__PURE__ */ function(e) {
	return e.AUTO = "general", e.CURRENCY_EUR = "\"€\"#,##0.00", e.CURRENCY_USD = "\"$\"#,##0.00", e.CURRENCY_GBP = "\"£\"#,##0.00", e.PERCENTAGE = "0.00%", e;
}({});
//#endregion
//#region src/components/Menu/useAnchorPosition.ts
function wa(e, t) {
	let n = w(null), [r, i] = T({});
	return S(() => {
		if (!e || !t) return;
		function r() {
			let e = n.current;
			if (!e || !t) return;
			let r = e.offsetWidth, a = e.offsetHeight, o = window.innerWidth, s = window.innerHeight, c = t.x, l = t.y;
			l + a > s - 8 && (t.flipY === void 0 ? t.y - a > 8 && (l = t.y - a) : l = t.flipY - a), c + r > o - 8 && (c = t.flipX === void 0 ? o - r - 8 : t.flipX - r), c < 8 && (c = 8), l + a > s - 8 && (l = s - a - 8), l < 8 && (l = 8), i({
				top: l,
				left: c
			});
		}
		return r(), window.addEventListener("resize", r), window.addEventListener("scroll", r, !0), () => {
			window.removeEventListener("resize", r), window.removeEventListener("scroll", r, !0);
		};
	}, [e, t]), {
		menuRef: n,
		position: r
	};
}
//#endregion
//#region src/components/Menu/useMenuKeyDown.ts
function Ta(e, t, n = !1) {
	function r(r) {
		let i = Array.from(e.current?.querySelectorAll(":is([role=\"menuitem\"],[role=\"menuitemradio\"],[role=\"menuitemcheckbox\"]):not([disabled])") ?? []);
		if (i.length === 0) return;
		let a = i.indexOf(document.activeElement);
		switch (r.key) {
			case "ArrowDown":
				r.preventDefault(), i[(a + 1) % i.length]?.focus();
				break;
			case "ArrowUp":
				r.preventDefault(), i[a <= 0 ? i.length - 1 : a - 1]?.focus();
				break;
			case "Home":
				r.preventDefault(), i[0]?.focus();
				break;
			case "End":
				r.preventDefault(), i[i.length - 1]?.focus();
				break;
			case "ArrowLeft":
				n && (r.preventDefault(), t());
				break;
			case "Escape":
				r.preventDefault(), t();
				break;
			case "Tab": t();
		}
	}
	return { handleMenuKeyDown: r };
}
//#endregion
//#region src/components/Menu/Menu.tsx
var Ea = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex=\"-1\"])", Da = h(null);
function Oa(e) {
	let t = e.trigger !== void 0, [n, r] = T(null), [i, a] = T(!1), o = (t ? i : e.open) && n !== null, s = Qt(t ? o : !1), c = wa(!t && o, t ? void 0 : e.anchorPosition), l = t ? s.menuRef : c.menuRef, u = t ? s.position : c.position, d = w(null), f = t ? void 0 : e.onClose, p = _(() => {
		if (t) {
			a(!1);
			let e = s.triggerRef.current;
			e && (e.matches(Ea) ? e : e.querySelector(Ea))?.focus();
		} else f?.();
	}, [
		t,
		f,
		s.triggerRef
	]);
	y(() => {
		if (!o) return;
		function e(e) {
			let n = e.target;
			if (!n) return;
			let r = t ? s.triggerRef.current?.contains(n) ?? !1 : !1, i = n instanceof Element && n.closest(".ic-menu-wrapper") !== null;
			!r && !i && p();
		}
		return document.addEventListener("pointerdown", e, !0), () => {
			document.removeEventListener("pointerdown", e, !0);
		};
	}, [
		o,
		p,
		t,
		s.triggerRef
	]);
	let { handleMenuKeyDown: h } = Ta(l, p);
	y(() => {
		o && (l.current?.querySelector(":is([role=\"menuitem\"],[role=\"menuitemradio\"],[role=\"menuitemcheckbox\"]):not([disabled])"))?.focus();
	}, [o, l]);
	let g = o ? Wt(/* @__PURE__ */ G("div", {
		ref: l,
		role: "presentation",
		className: "ic-menu-wrapper",
		style: u,
		children: /* @__PURE__ */ G("div", {
			role: "menu",
			className: "ic-menu",
			onKeyDown: h,
			children: e.children
		})
	}), n) : null;
	if (!t) return /* @__PURE__ */ K(Da.Provider, {
		value: {
			close: p,
			activeSetOpenRef: d
		},
		children: [/* @__PURE__ */ G("span", {
			ref: r,
			hidden: !0
		}), g]
	});
	let v = e.trigger, b = v.props.onClick, x = m(v, {
		ref: s.triggerRef,
		onClick: (e) => {
			b?.(e), a((e) => !e);
		},
		"aria-haspopup": "menu",
		"aria-expanded": o ? "true" : "false"
	});
	return /* @__PURE__ */ K(Da.Provider, {
		value: {
			close: p,
			activeSetOpenRef: d
		},
		children: [
			x,
			/* @__PURE__ */ G("span", {
				ref: r,
				hidden: !0
			}),
			g
		]
	});
}
Oa.displayName = "Menu";
//#endregion
//#region src/components/Menu/MenuItem.tsx
function $({ onClick: e, disabled: t = !1, destructive: n = !1, icon: r, secondaryText: i, checked: a, children: o }) {
	let s = v(Da), c = a !== void 0;
	function l() {
		e?.(), s?.close();
	}
	return /* @__PURE__ */ K("button", {
		type: "button",
		role: c ? "menuitemradio" : "menuitem",
		...c && { "aria-checked": a },
		className: [
			"ic-menu-item",
			n && "destructive",
			t && "disabled"
		].filter(Boolean).join(" "),
		disabled: t,
		onClick: l,
		children: [
			c && /* @__PURE__ */ G("span", {
				className: "ic-menu-item-icon",
				"aria-hidden": "true",
				style: { visibility: a ? "visible" : "hidden" },
				children: /* @__PURE__ */ G(L, {})
			}),
			r && /* @__PURE__ */ G("span", {
				className: "ic-menu-item-icon",
				"aria-hidden": "true",
				children: r
			}),
			/* @__PURE__ */ G("span", {
				className: "ic-menu-item-label",
				children: o
			}),
			i ? /* @__PURE__ */ G("span", {
				className: "ic-menu-item-secondary",
				children: i
			}) : null
		]
	});
}
$.displayName = "MenuItem";
function ka({ icon: e, children: t, submenu: n }) {
	let r = v(Da), i = r?.activeSetOpenRef ?? null, [a, o] = T(!1), [s, c] = T(), l = w(null), u = w(null), d = w(!1), f = w(null), { menuRef: p, position: m } = wa(a, s), { handleMenuKeyDown: h } = Ta(p, () => {
		o(!1), l.current?.focus();
	}, !0);
	y(() => {
		a && d.current && (d.current = !1, (p.current?.querySelector(":is([role=\"menuitem\"],[role=\"menuitemradio\"],[role=\"menuitemcheckbox\"]):not([disabled])"))?.focus());
	}, [a, p]), y(() => () => {
		u.current && clearTimeout(u.current), i?.current === o && (i.current = null);
	}, [i]);
	function g() {
		u.current && clearTimeout(u.current), i?.current && i.current !== o && i.current(!1), i && (i.current = o);
		let e = l.current?.getBoundingClientRect();
		e && c({
			x: e.right + 4,
			y: e.top - 4,
			flipX: e.left - 4,
			flipY: e.bottom + 4
		}), o(!0);
	}
	function _() {
		u.current = setTimeout(() => {
			o(!1), i?.current === o && (i.current = null);
		}, 150);
	}
	function b() {
		u.current && clearTimeout(u.current);
	}
	function x() {
		o(!1), r?.close();
	}
	return /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ K("button", {
		ref: l,
		type: "button",
		role: "menuitem",
		className: "ic-menu-item",
		onMouseEnter: g,
		onMouseLeave: _,
		onKeyDown: (e) => {
			(e.key === "ArrowRight" || e.key === "Enter") && (e.preventDefault(), d.current = !0, g());
		},
		"aria-haspopup": "menu",
		"aria-expanded": a,
		children: [
			e ? /* @__PURE__ */ G("span", {
				className: "ic-menu-item-icon",
				"aria-hidden": "true",
				children: e
			}) : null,
			/* @__PURE__ */ G("span", {
				className: "ic-menu-item-label",
				children: t
			}),
			/* @__PURE__ */ G("span", {
				className: "ic-menu-item-icon",
				"aria-hidden": "true",
				children: /* @__PURE__ */ G(oe, {})
			})
		]
	}), a ? Wt(/* @__PURE__ */ G(Da.Provider, {
		value: {
			close: x,
			activeSetOpenRef: f
		},
		children: /* @__PURE__ */ G("div", {
			ref: p,
			role: "presentation",
			className: "ic-menu-wrapper",
			style: m,
			children: /* @__PURE__ */ G("div", {
				role: "menu",
				className: "ic-menu",
				onMouseEnter: b,
				onMouseLeave: _,
				onKeyDown: (e) => {
					e.stopPropagation(), h(e);
				},
				children: n
			})
		})
	}), l.current) : null] });
}
ka.displayName = "MenuItemWithSubmenu";
//#endregion
//#region src/components/Switch/Switch.tsx
var Aa = g(function({ checked: e, onChange: t, label: n, disabled: r = !1, id: i, style: a, className: o, ...s }, c) {
	let l = b(), u = i ?? l, d = [
		"ic-switch",
		r && "disabled",
		o
	].filter(Boolean).join(" ");
	return /* @__PURE__ */ K("label", {
		className: d,
		style: a,
		htmlFor: u,
		children: [
			n && /* @__PURE__ */ G("span", {
				className: "ic-switch-label",
				children: n
			}),
			/* @__PURE__ */ G("input", {
				ref: c,
				id: u,
				type: "checkbox",
				role: "switch",
				"aria-checked": e,
				checked: e,
				disabled: r,
				onChange: (e) => t(e.target.checked),
				className: "ic-switch-input",
				...s
			}),
			/* @__PURE__ */ G("span", {
				className: "ic-switch-track",
				"aria-hidden": "true",
				children: /* @__PURE__ */ G("span", { className: "ic-switch-thumb" })
			})
		]
	});
});
Aa.displayName = "Switch";
//#endregion
//#region src/components/RightDrawer/NamedStyles/named-styles-utils.ts
var ja = {
	left: "flex-start",
	center: "center",
	right: "flex-end"
}, Ma = {
	top: "flex-start",
	center: "center",
	bottom: "flex-end"
}, Na = {
	thin: "1px",
	medium: "2px",
	thick: "3px",
	double: "3px",
	dotted: "1px",
	slantdashdot: "1px",
	mediumdashed: "2px",
	mediumdashdotdot: "2px",
	mediumdashdot: "2px"
}, Pa = {
	thin: "solid",
	medium: "solid",
	thick: "solid",
	double: "double",
	dotted: "dotted",
	slantdashdot: "dashed",
	mediumdashed: "dashed",
	mediumdashdotdot: "dashed",
	mediumdashdot: "dashed"
}, Fa = "1px solid color-mix(in srgb, var(--palette-common-black) 12%, transparent)";
function Ia(e, t) {
	return `${Na[e] ?? "1px"} ${Pa[e] ?? "solid"} ${t}`;
}
function La(e, t) {
	if (!t?.style) return;
	let n = e.resolveColor(t.color) || "currentColor";
	return Ia(t.style, n);
}
function Ra(e, t, n) {
	return e === Q.AUTO ? "Aa" : e === t.number_fmt ? "#" : e === Q.PERCENTAGE ? "%" : e === Q.CURRENCY_EUR ? n("toolbar.format_menu.currency_eur_example") : e === Q.CURRENCY_USD ? n("toolbar.format_menu.currency_usd_example") : e === Q.CURRENCY_GBP ? n("toolbar.format_menu.currency_gbp_example") : e === t.short_date || e === t.long_date ? "31/12" : "C";
}
function za(e, t) {
	let n = [];
	t.font.u && n.push("underline"), t.font.strike && n.push("line-through");
	let r = {
		backgroundColor: e.resolveColor(t.fill.color) || void 0,
		color: e.resolveColor(t.font.color) || (t.fill.color ? Ln["--palette-sheet-default-text-color"] : void 0),
		fontWeight: t.font.b ? "bold" : void 0,
		fontStyle: t.font.i ? "italic" : void 0,
		textDecoration: n.length > 0 ? n.join(" ") : void 0,
		justifyContent: t.alignment?.horizontal ? ja[t.alignment.horizontal] : void 0,
		alignItems: t.alignment?.vertical ? Ma[t.alignment.vertical] : void 0
	}, i = La(e, t.border?.top), a = La(e, t.border?.right), o = La(e, t.border?.bottom), s = La(e, t.border?.left);
	return (i || a || o || s) && (r.boxShadow = "none", r.borderTop = i ?? "1px solid color-mix(in srgb, var(--palette-common-black) 12%, transparent)", r.borderRight = a ?? "1px solid color-mix(in srgb, var(--palette-common-black) 12%, transparent)", r.borderBottom = o ?? "1px solid color-mix(in srgb, var(--palette-common-black) 12%, transparent)", r.borderLeft = s ?? "1px solid color-mix(in srgb, var(--palette-common-black) 12%, transparent)"), r;
}
//#endregion
//#region src/components/RightDrawer/NamedStyles/EditNamedStyle.tsx
function Ba(e, t, n) {
	let r = {};
	if (n.includeFill && (r.backgroundColor = X(e.fillColor, t) || void 0), n.includeFont) {
		let n = [];
		e.underline && n.push("underline"), e.strike && n.push("line-through"), r.color = X(e.fontColor, t) || void 0, r.fontWeight = e.bold ? "bold" : void 0, r.fontStyle = e.italic ? "italic" : void 0, r.textDecoration = n.length > 0 ? n.join(" ") : void 0;
	}
	if (n.includeAlignment && (r.justifyContent = ja[n.horizontalAlign], r.alignItems = Ma[n.verticalAlign]), n.includeBorder) {
		let { top: e, right: i, bottom: a, left: o } = n.borderSides, s = Ia(n.borderLineStyle, X(n.borderColor, t));
		r.boxShadow = "none", r.borderTop = e ? s : Fa, r.borderRight = i ? s : Fa, r.borderBottom = a ? s : Fa, r.borderLeft = o ? s : Fa;
	}
	return r;
}
function Va(e, t) {
	return {
		bold: t.font.b,
		italic: t.font.i,
		underline: t.font.u,
		strike: t.font.strike,
		fontColor: e.resolveColor(t.font.color),
		fillColor: e.resolveColor(t.fill.color)
	};
}
var Ha = "__custom__", Ua = [
	"bold",
	"italic",
	"underline",
	"strike"
], Wa = [
	"top",
	"right",
	"bottom",
	"left"
], Ga = ({ model: e, name: n, style: r, formatOptions: i, existingStyleNames: a, currentTheme: o, onSave: s, onClose: c }) => {
	let { t: l } = D(), u = () => {
		if (n) return n;
		let e = l("named_styles.default_name_prefix"), t = new Set(a.map((e) => e.toLowerCase())), r = 1, i = `${e}${r}`;
		for (; t.has(i.toLowerCase());) r++, i = `${e}${r}`;
		return i;
	}, d = [
		Q.AUTO,
		i.number_fmt,
		Q.PERCENTAGE,
		Q.CURRENCY_EUR,
		Q.CURRENCY_USD,
		Q.CURRENCY_GBP,
		i.short_date,
		i.long_date
	], [f, p] = T(u), [m, h] = T(""), [g, _] = T(() => Va(e, r)), [v, b] = T(r.num_fmt), [x, S] = T(() => d.includes(r.num_fmt) ? "" : r.num_fmt), [C, E] = T(!1), [k] = T(() => {
		if (!n) return null;
		try {
			return e.getNamedStyleIncludes(n);
		} catch {
			return null;
		}
	}), [M, N] = T(k?.number_format ?? !0), [P, F] = T(k?.font ?? !0), [I, te] = T(k?.fill ?? !0), [ie, R] = T(k?.alignment ?? !1), [ae, oe] = T(r.alignment?.horizontal ?? "general"), [se, ce] = T(r.alignment?.vertical ?? "bottom"), [le, z] = T(k?.border ?? !1), [B, V] = T(() => ({
		top: !!r.border.top?.style,
		right: !!r.border.right?.style,
		bottom: !!r.border.bottom?.style,
		left: !!r.border.left?.style
	})), [ue, de] = T(() => (r.border.top ?? r.border.right ?? r.border.bottom ?? r.border.left)?.style || t.Thin), [fe, pe] = T(() => (r.border.top ?? r.border.right ?? r.border.bottom ?? r.border.left)?.color ?? ""), [H, me] = T(!1), [he, U] = T(!1), [ge, _e] = T(!1), ve = w(null), ye = w(null), be = w(null), xe = w(null), Ce = B.top && B.right && B.bottom && B.left, we = !B.top && !B.right && !B.bottom && !B.left, Te = (e) => V({
		top: e,
		right: e,
		bottom: e,
		left: e
	}), Ee = !d.includes(v), De = w(Ee);
	y(() => {
		Ee && !De.current && xe.current?.focus(), De.current = Ee;
	}, [Ee]);
	let Oe = [
		{
			value: Q.AUTO,
			label: l("toolbar.format_menu.auto")
		},
		{
			value: i.number_fmt,
			label: l("toolbar.format_menu.number")
		},
		{
			value: Q.PERCENTAGE,
			label: l("toolbar.format_menu.percentage")
		},
		{
			value: Q.CURRENCY_EUR,
			label: l("toolbar.format_menu.currency_eur")
		},
		{
			value: Q.CURRENCY_USD,
			label: l("toolbar.format_menu.currency_usd")
		},
		{
			value: Q.CURRENCY_GBP,
			label: l("toolbar.format_menu.currency_gbp")
		},
		{
			value: i.short_date,
			label: l("toolbar.format_menu.date_short")
		},
		{
			value: i.long_date,
			label: l("toolbar.format_menu.date_long")
		},
		{
			value: Ha,
			label: l("toolbar.format_menu.custom")
		}
	], ke = (e) => {
		e === Ha ? (E(!1), b(x || "")) : b(e);
	}, Ae = Ee ? Ha : v, je = M && Ee && !x.trim(), Me = !!m || !f.trim() || je, Ne = () => {
		if (Me) {
			E(!0);
			return;
		}
		let e = (e) => e ? {
			style: ue,
			color: fe || void 0
		} : void 0, t = {
			...r,
			num_fmt: v,
			alignment: {
				horizontal: ae,
				vertical: se,
				wrap_text: r.alignment?.wrap_text ?? !1
			},
			border: {
				...r.border,
				top: e(B.top),
				right: e(B.right),
				bottom: e(B.bottom),
				left: e(B.left)
			},
			fill: {
				...r.fill,
				color: g.fillColor || void 0
			},
			font: {
				...r.font,
				b: g.bold || !1,
				i: g.italic || !1,
				u: g.underline || !1,
				strike: g.strike || !1,
				color: g.fontColor || void 0
			}
		}, n = s({
			name: f.trim(),
			style: t,
			includes: {
				number_format: M,
				font: P,
				fill: I,
				border: le,
				alignment: ie,
				protection: !0
			}
		});
		n.nameError ? h(n.nameError) : c();
	}, Pe = (e) => {
		e.stopPropagation(), (e.metaKey || e.ctrlKey) && e.key === "Enter" && (e.preventDefault(), Ne());
	};
	return /* @__PURE__ */ K("div", {
		className: "ic-edit-style-container",
		onKeyDown: Pe,
		children: [/* @__PURE__ */ K("div", {
			className: "ic-edit-style-content-area",
			children: [
				/* @__PURE__ */ K("div", {
					className: "ic-edit-style-header-box",
					children: [/* @__PURE__ */ G("div", {
						className: "ic-edit-style-preview",
						style: Ba(g, o, {
							includeFont: P,
							includeFill: I,
							includeAlignment: ie,
							includeBorder: le,
							horizontalAlign: ae,
							verticalAlign: se,
							borderSides: B,
							borderLineStyle: ue,
							borderColor: fe
						}),
						children: Ra(M ? v : Q.AUTO, i, l)
					}), /* @__PURE__ */ G("span", {
						className: "ic-edit-style-header-box-text",
						children: f.trim() || l("named_styles.new_style")
					})]
				}),
				/* @__PURE__ */ G("div", {
					className: "ic-edit-style-styled-box",
					children: /* @__PURE__ */ G(Y, {
						autoFocus: !0,
						type: "text",
						label: l("named_styles.name_label"),
						placeholder: l("named_styles.name_placeholder"),
						value: f,
						error: !!m,
						helperText: m,
						onChange: (e) => {
							p(e.target.value), h("");
						},
						onKeyDown: Pe
					})
				}),
				/* @__PURE__ */ G("div", {
					className: "ic-edit-style-styled-box ic-edit-style-section-header",
					children: /* @__PURE__ */ G("div", {
						className: "ic-edit-style-section-title",
						children: l("named_styles.style_properties")
					})
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-edit-style-styled-box ic-edit-style-format-group",
					children: [/* @__PURE__ */ G(Aa, {
						checked: M,
						onChange: N,
						label: l("named_styles.number_label")
					}), M && /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G($n, {
						label: l("named_styles.format_label"),
						value: Ae,
						options: Oe,
						onChange: ke
					}), Ee && /* @__PURE__ */ G(Y, {
						ref: xe,
						type: "text",
						placeholder: l("named_styles.custom_format_placeholder"),
						value: x,
						error: C && je,
						helperText: C && je ? l("named_styles.custom_format_required") : "",
						onChange: (e) => {
							S(e.target.value), b(e.target.value);
						},
						onBlur: () => E(!0),
						onKeyDown: Pe
					})] })]
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-edit-style-styled-box ic-edit-style-format-group",
					children: [/* @__PURE__ */ G(Aa, {
						checked: P,
						onChange: (e) => {
							F(e), e || me(!1);
						},
						label: l("named_styles.font_label")
					}), P && /* @__PURE__ */ K("div", {
						className: "ic-edit-style-subrow",
						children: [/* @__PURE__ */ G("span", {
							className: "ic-edit-style-sublabel",
							children: l("named_styles.font_style_label")
						}), /* @__PURE__ */ K("div", {
							className: "ic-edit-style-controls-row",
							children: [
								/* @__PURE__ */ G(Xi, {
									multiple: !0,
									size: "md",
									value: Ua.filter((e) => g[e]),
									onChange: (e) => _((t) => ({
										...t,
										bold: e.includes("bold"),
										italic: e.includes("italic"),
										underline: e.includes("underline"),
										strike: e.includes("strike")
									})),
									options: [
										{
											value: "bold",
											icon: /* @__PURE__ */ G(re, {}),
											"aria-label": l("toolbar.bold")
										},
										{
											value: "italic",
											icon: /* @__PURE__ */ G(Se, {}),
											"aria-label": l("toolbar.italic")
										},
										{
											value: "underline",
											icon: /* @__PURE__ */ G(ot, {}),
											"aria-label": l("toolbar.underline")
										},
										{
											value: "strike",
											icon: /* @__PURE__ */ G(Ye, {}),
											"aria-label": l("toolbar.strike_through")
										}
									]
								}),
								/* @__PURE__ */ G("div", {
									className: "ic-input-control md ic-edit-style-swatch-wrapper",
									children: /* @__PURE__ */ G("button", {
										ref: ve,
										type: "button",
										className: "ic-edit-style-swatch",
										style: { backgroundColor: X(g.fontColor, o) || "var(--palette-sheet-default-text-color)" },
										onClick: () => me(!0),
										"aria-label": l("toolbar.font_color")
									})
								}),
								/* @__PURE__ */ G(Zr, {
									color: g.fontColor,
									defaultColor: "",
									defaultSwatchColor: "var(--palette-sheet-default-text-color)",
									title: l("color_picker.default"),
									onChange: (e) => {
										_((t) => ({
											...t,
											fontColor: e
										})), me(!1);
									},
									onClose: () => me(!1),
									anchorEl: ve,
									open: H,
									theme: o
								})
							]
						})]
					})]
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-edit-style-styled-box ic-edit-style-format-group",
					children: [/* @__PURE__ */ G(Aa, {
						checked: I,
						onChange: (e) => {
							te(e), e || U(!1);
						},
						label: l("named_styles.fill_label")
					}), I && /* @__PURE__ */ K("div", {
						className: "ic-edit-style-subrow",
						children: [
							/* @__PURE__ */ G("span", {
								className: "ic-edit-style-sublabel",
								children: l("named_styles.background_color_label")
							}),
							/* @__PURE__ */ G("div", {
								className: "ic-input-control md ic-edit-style-swatch-wrapper",
								children: /* @__PURE__ */ G("button", {
									ref: ye,
									type: "button",
									className: "ic-edit-style-swatch",
									style: { backgroundColor: X(g.fillColor, o) || "transparent" },
									onClick: () => U(!0),
									"aria-label": l("toolbar.fill_color")
								})
							}),
							/* @__PURE__ */ G(Zr, {
								color: g.fillColor || "#FFFFFF",
								defaultColor: "",
								title: l("color_picker.default"),
								onChange: (e) => {
									_((t) => ({
										...t,
										fillColor: e
									})), U(!1);
								},
								onClose: () => U(!1),
								anchorEl: ye,
								open: he,
								theme: o
							})
						]
					})]
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-edit-style-styled-box ic-edit-style-format-group",
					children: [/* @__PURE__ */ G(Aa, {
						checked: ie,
						onChange: R,
						label: l("named_styles.alignment_label")
					}), ie && /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ K("div", {
						className: "ic-edit-style-subrow",
						children: [/* @__PURE__ */ G("span", {
							className: "ic-edit-style-sublabel",
							children: l("named_styles.horizontal_align_label")
						}), /* @__PURE__ */ G(Xi, {
							size: "md",
							value: ae,
							onChange: (e) => oe(ae === e ? "general" : e),
							options: [
								{
									value: "left",
									icon: /* @__PURE__ */ G(A, {}),
									"aria-label": l("toolbar.align_left")
								},
								{
									value: "center",
									icon: /* @__PURE__ */ G(O, {}),
									"aria-label": l("toolbar.align_center")
								},
								{
									value: "right",
									icon: /* @__PURE__ */ G(j, {}),
									"aria-label": l("toolbar.align_right")
								}
							]
						})]
					}), /* @__PURE__ */ K("div", {
						className: "ic-edit-style-subrow",
						children: [/* @__PURE__ */ G("span", {
							className: "ic-edit-style-sublabel",
							children: l("named_styles.vertical_align_label")
						}), /* @__PURE__ */ G(Xi, {
							size: "md",
							value: se,
							onChange: ce,
							options: [
								{
									value: "top",
									icon: /* @__PURE__ */ G(ne, {}),
									"aria-label": l("toolbar.vertical_align_top")
								},
								{
									value: "center",
									icon: /* @__PURE__ */ G(ht, {}),
									"aria-label": l("toolbar.vertical_align_middle")
								},
								{
									value: "bottom",
									icon: /* @__PURE__ */ G(ee, {}),
									"aria-label": l("toolbar.vertical_align_bottom")
								}
							]
						})]
					})] })]
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-edit-style-styled-box ic-edit-style-format-group",
					children: [/* @__PURE__ */ G(Aa, {
						checked: le,
						onChange: (e) => {
							z(e), e || _e(!1);
						},
						label: l("named_styles.border_label")
					}), le && /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ K("div", {
						className: "ic-edit-style-subrow",
						children: [/* @__PURE__ */ G("span", {
							className: "ic-edit-style-sublabel",
							children: l("named_styles.border_label")
						}), /* @__PURE__ */ K("div", {
							className: "ic-edit-style-controls-row",
							children: [/* @__PURE__ */ G(Xi, {
								size: "md",
								value: Ce ? "all" : we ? "none" : "mixed",
								onChange: (e) => Te(e === "all" && !Ce),
								options: [{
									value: "all",
									icon: /* @__PURE__ */ G(St, {}),
									"aria-label": l("toolbar.borders.all")
								}, {
									value: "none",
									icon: /* @__PURE__ */ G(xt, {}),
									"aria-label": l("toolbar.borders.clear")
								}]
							}), /* @__PURE__ */ G(Xi, {
								multiple: !0,
								size: "md",
								value: Wa.filter((e) => B[e]),
								onChange: (e) => V({
									top: e.includes("top"),
									right: e.includes("right"),
									bottom: e.includes("bottom"),
									left: e.includes("left")
								}),
								options: [
									{
										value: "top",
										icon: /* @__PURE__ */ G(wt, {}),
										"aria-label": l("toolbar.borders.top")
									},
									{
										value: "right",
										icon: /* @__PURE__ */ G(Ct, {}),
										"aria-label": l("toolbar.borders.right")
									},
									{
										value: "bottom",
										icon: /* @__PURE__ */ G(gt, {}),
										"aria-label": l("toolbar.borders.bottom")
									},
									{
										value: "left",
										icon: /* @__PURE__ */ G(bt, {}),
										"aria-label": l("toolbar.borders.left")
									}
								]
							})]
						})]
					}), /* @__PURE__ */ K("div", {
						className: "ic-edit-style-subrow",
						children: [/* @__PURE__ */ G("span", {
							className: "ic-edit-style-sublabel",
							children: l("named_styles.line_style_label")
						}), /* @__PURE__ */ K("div", {
							className: "ic-edit-style-controls-row",
							children: [
								/* @__PURE__ */ G(Oa, {
									trigger: /* @__PURE__ */ G("div", {
										className: "ic-input-control md ic-edit-style-line-style-wrapper",
										children: /* @__PURE__ */ G("button", {
											type: "button",
											className: "ic-edit-style-line-style-trigger",
											"aria-label": l("toolbar.borders.style"),
											children: /* @__PURE__ */ G("span", {
												className: `ic-line-preview ${ba.find((e) => e.value === ue)?.previewClassName ?? "thin"}`,
												style: { color: X(fe, o) }
											})
										})
									}),
									children: ba.map((e) => /* @__PURE__ */ G($, {
										checked: ue === e.value,
										onClick: () => de(e.value),
										children: /* @__PURE__ */ G("span", {
											className: `ic-line-preview ${e.previewClassName}`,
											style: { color: X(fe, o) }
										})
									}, e.value))
								}),
								/* @__PURE__ */ G("div", {
									className: "ic-input-control md ic-edit-style-swatch-wrapper",
									children: /* @__PURE__ */ G("button", {
										ref: be,
										type: "button",
										className: "ic-edit-style-swatch",
										style: { backgroundColor: X(fe, o) || "var(--palette-sheet-default-text-color)" },
										onClick: () => _e(!0),
										"aria-label": l("toolbar.borders.color")
									})
								}),
								/* @__PURE__ */ G(Zr, {
									color: fe,
									defaultColor: "",
									defaultSwatchColor: "var(--palette-sheet-default-text-color)",
									title: l("color_picker.default"),
									onChange: (e) => {
										pe(e), _e(!1);
									},
									onClose: () => _e(!1),
									anchorEl: be,
									open: ge,
									theme: o
								})
							]
						})]
					})] })]
				})
			]
		}), /* @__PURE__ */ K("div", {
			className: "ic-edit-style-footer",
			children: [/* @__PURE__ */ G(q, {
				variant: "secondary",
				onClick: c,
				children: l("named_styles.cancel")
			}), /* @__PURE__ */ G(q, {
				startIcon: /* @__PURE__ */ G(L, {}),
				disabled: Me,
				onClick: Ne,
				children: l("named_styles.apply")
			})]
		})]
	});
}, Ka = ({ model: e, customStyles: t, formatOptions: n, onEdit: r, onDelete: i }) => {
	let { t: a } = D();
	return t.length === 0 ? /* @__PURE__ */ K("div", {
		className: "ic-named-styles-empty-state-message",
		children: [
			/* @__PURE__ */ G("div", {
				className: "ic-named-styles-icon-wrapper",
				children: /* @__PURE__ */ G(je, {})
			}),
			a("named_styles.empty_message1"),
			/* @__PURE__ */ G("br", {}),
			a("named_styles.empty_message2")
		]
	}) : /* @__PURE__ */ G("div", {
		className: "ic-named-styles-manage-list",
		children: t.map((t) => /* @__PURE__ */ K("div", {
			className: "ic-named-styles-manage-item",
			children: [
				/* @__PURE__ */ G("div", {
					className: "ic-named-styles-manage-item-preview",
					style: za(e, t.style),
					children: Ra(t.style.num_fmt, n, a)
				}),
				/* @__PURE__ */ G("div", {
					className: "ic-named-styles-manage-item-name",
					children: t.name
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-named-styles-manage-item-icons",
					children: [/* @__PURE__ */ G(Z, {
						title: a("named_styles.update_style"),
						children: /* @__PURE__ */ G(J, {
							icon: /* @__PURE__ */ G(Pe, { size: 16 }),
							onClick: () => r(t),
							"aria-label": a("named_styles.update_style")
						})
					}), /* @__PURE__ */ G(Z, {
						title: a("named_styles.delete_style"),
						children: /* @__PURE__ */ G(J, {
							icon: /* @__PURE__ */ G(rt, { size: 16 }),
							onClick: () => i(t),
							"aria-label": a("named_styles.delete_style")
						})
					})]
				})
			]
		}, t.name))
	});
}, qa = [
	{
		labelKey: "named_styles.category_good_bad_neutral",
		type: "grid",
		names: [
			"normal",
			"bad",
			"good",
			"neutral"
		]
	},
	{
		labelKey: "named_styles.category_data_and_model",
		type: "grid",
		names: [
			"calculation",
			"check cell",
			"explanatory text",
			"input",
			"linked cell",
			"note",
			"output",
			"warning text"
		]
	},
	{
		labelKey: "named_styles.category_titles_and_headings",
		type: "grid",
		names: [
			"heading 1",
			"heading 2",
			"heading 3",
			"heading 4",
			"title",
			"total"
		]
	},
	{
		labelKey: "named_styles.category_themed_cell_styles",
		type: "themed",
		names: /* @__PURE__ */ "20% - accent1.40% - accent1.60% - accent1.80% - accent1.accent1.20% - accent2.40% - accent2.60% - accent2.80% - accent2.accent2.20% - accent3.40% - accent3.60% - accent3.80% - accent3.accent3.20% - accent4.40% - accent4.60% - accent4.80% - accent4.accent4.20% - accent5.40% - accent5.60% - accent5.80% - accent5.accent5.20% - accent6.40% - accent6.60% - accent6.80% - accent6.accent6".split(".")
	},
	{
		labelKey: "named_styles.category_number_format",
		type: "grid",
		names: [
			"comma",
			"comma [0]",
			"currency",
			"currency [0]",
			"percent"
		]
	}
];
function Ja(e, t) {
	let n = new Map(e.map((e) => [e.name.toLowerCase(), e]));
	return qa.map((e) => ({
		label: t(e.labelKey),
		type: e.type,
		styles: e.names.map((e) => n.get(e)).filter((e) => e !== void 0)
	})).filter((e) => e.styles.length > 0);
}
var Ya = [
	"named_styles.accent_1",
	"named_styles.accent_2",
	"named_styles.accent_3",
	"named_styles.accent_4",
	"named_styles.accent_5",
	"named_styles.accent_6"
], Xa = ({ model: e, customStyles: t, builtinStyles: n, formatOptions: r, currentTheme: i, onApplyNamedStyle: a, onAddNamedStyle: o, onUpdateNamedStyle: s, onDeleteNamedStyle: c, onClose: l }) => {
	let { t: u } = D(), [d, f] = T({ mode: "list" }), p = n.find((e) => e.name.toLowerCase() === "normal"), m = Ja(n, u), h = [...t.map((e) => e.name), ...n.map((e) => e.name)], g = ({ name: t, style: n }, r) => /* @__PURE__ */ G("button", {
		type: "button",
		className: "ic-named-styles-tile",
		style: za(e, n),
		onClick: () => a(t),
		children: /* @__PURE__ */ G("span", {
			className: "ic-named-styles-tile-text",
			children: r ?? t
		})
	}, t), _ = (e) => e.type === "themed" ? /* @__PURE__ */ G("div", {
		className: "ic-named-styles-rows",
		children: Ya.map((t, n) => {
			let r = `accent${n + 1}`, i = e.styles.filter((e) => e.name.toLowerCase().endsWith(r));
			if (i.length === 0) return null;
			let a = u(t);
			return /* @__PURE__ */ G("div", {
				className: "ic-named-styles-row",
				children: i.map((e) => {
					let t = e.name.match(/^(\d+%)/);
					return g(e, t ? t[1] : a);
				})
			}, t);
		})
	}) : /* @__PURE__ */ G("div", {
		className: "ic-named-styles-grid",
		children: e.styles.map((e) => g(e))
	}), v = (e, t) => /* @__PURE__ */ K("div", {
		className: "ic-named-styles-edit-header",
		children: [
			/* @__PURE__ */ G(Z, {
				title: u("named_styles.back_to_list"),
				children: /* @__PURE__ */ G(J, {
					icon: /* @__PURE__ */ G(P, {}),
					onClick: t ?? (() => f({ mode: "list" })),
					"aria-label": u("named_styles.back_to_list")
				})
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-named-styles-edit-header-title",
				children: e
			}),
			/* @__PURE__ */ G(Z, {
				title: u("right_drawer.close"),
				children: /* @__PURE__ */ G(J, {
					icon: /* @__PURE__ */ G(lt, {}),
					onClick: l,
					"aria-label": u("right_drawer.close")
				})
			})
		]
	});
	if (d.mode === "create" && p) return /* @__PURE__ */ K("div", {
		className: "ic-named-styles-container",
		children: [v(u("named_styles.add_new_style")), /* @__PURE__ */ G("div", {
			className: "ic-named-styles-content",
			children: /* @__PURE__ */ G(Ga, {
				model: e,
				name: "",
				style: p.style,
				formatOptions: r,
				existingStyleNames: h,
				currentTheme: i,
				onSave: (e) => h.some((t) => t.toLowerCase() === e.name.toLowerCase()) ? { nameError: u("named_styles.name_already_exists") } : o(e),
				onClose: () => f({ mode: "list" })
			})
		})]
	});
	if (d.mode === "manage") return /* @__PURE__ */ K("div", {
		className: "ic-named-styles-container",
		children: [
			v(u("named_styles.manage_styles")),
			/* @__PURE__ */ G("div", {
				className: "ic-named-styles-content",
				children: /* @__PURE__ */ G(Ka, {
					model: e,
					customStyles: t,
					formatOptions: r,
					onEdit: (e) => f({
						mode: "editing",
						style: e
					}),
					onDelete: (e) => c(e.name)
				})
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-named-styles-footer",
				children: /* @__PURE__ */ G(q, {
					startIcon: /* @__PURE__ */ G(Ie, {}),
					onClick: () => f({ mode: "create" }),
					children: u("named_styles.add_new_style")
				})
			})
		]
	});
	if (d.mode === "editing") {
		let { style: t } = d, n = h.filter((e) => e.toLowerCase() !== t.name.toLowerCase());
		return /* @__PURE__ */ K("div", {
			className: "ic-named-styles-container",
			children: [v(u("named_styles.update_style"), () => f({ mode: "manage" })), /* @__PURE__ */ G("div", {
				className: "ic-named-styles-content",
				children: /* @__PURE__ */ G(Ga, {
					model: e,
					name: t.name,
					style: t.style,
					formatOptions: r,
					existingStyleNames: h,
					currentTheme: i,
					onSave: (e) => n.some((t) => t.toLowerCase() === e.name.toLowerCase()) ? { nameError: u("named_styles.name_already_exists") } : s(t.name, e),
					onClose: () => f({ mode: "manage" })
				})
			})]
		});
	}
	return /* @__PURE__ */ K("div", {
		className: "ic-named-styles-container",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-named-styles-header",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-named-styles-header-title",
					children: u("named_styles.panel_title")
				}), /* @__PURE__ */ G(Z, {
					title: u("right_drawer.close"),
					children: /* @__PURE__ */ G(J, {
						icon: /* @__PURE__ */ G(lt, {}),
						onClick: l,
						"aria-label": u("right_drawer.close")
					})
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-named-styles-content",
				children: [t.length > 0 && /* @__PURE__ */ K("div", {
					className: "ic-named-styles-section",
					children: [/* @__PURE__ */ K("div", {
						className: "ic-named-styles-section-title",
						style: { height: "17px" },
						children: [u("named_styles.section_custom"), /* @__PURE__ */ G("div", {
							className: "ic-named-styles-section-title-actions",
							children: /* @__PURE__ */ G(Z, {
								title: u("named_styles.manage_styles"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(Ge, { size: 14 }),
									onClick: () => f({ mode: "manage" }),
									"aria-label": u("named_styles.manage_styles")
								})
							})
						})]
					}), /* @__PURE__ */ G("div", {
						className: "ic-named-styles-grid",
						children: t.map((e) => g(e))
					})]
				}), /* @__PURE__ */ K("div", {
					className: "ic-named-styles-section",
					children: [/* @__PURE__ */ G("div", {
						className: "ic-named-styles-section-title",
						children: u("named_styles.section_theme")
					}), m.map((e) => /* @__PURE__ */ K("div", {
						className: "ic-named-styles-category",
						children: [/* @__PURE__ */ G("div", {
							className: "ic-named-styles-category-label",
							children: e.label
						}), _(e)]
					}, e.label))]
				})]
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-named-styles-footer",
				children: /* @__PURE__ */ G(q, {
					startIcon: /* @__PURE__ */ G(Ie, {}),
					onClick: () => f({ mode: "create" }),
					children: u("named_styles.add_new_style")
				})
			})
		]
	});
}, Za = {
	en: "en-US",
	es: "es-ES",
	fr: "fr-FR",
	de: "de-DE",
	it: "it-IT"
}, Qa = {
	en: {
		number: "1,234.56",
		dateTime: "10/17/2026 09:21:06 PM",
		delimiterType: "comma",
		delimiterChar: ","
	},
	es: {
		number: "1.234,56",
		dateTime: "17/10/2026 21:21:06",
		delimiterType: "semicolon",
		delimiterChar: ";"
	},
	fr: {
		number: "1 234,56",
		dateTime: "17/10/2026 21:21:06",
		delimiterType: "semicolon",
		delimiterChar: ";"
	},
	de: {
		number: "1.234,56",
		dateTime: "17.10.2026 21:21:06",
		delimiterType: "semicolon",
		delimiterChar: ";"
	},
	it: {
		number: "1.234,56",
		dateTime: "17/10/2026 21:21:06",
		delimiterType: "semicolon",
		delimiterChar: ";"
	}
}, $a = (e) => Za[e] ?? e, eo = (e) => {
	let { t } = D(), n = s(), r = o(), [i, a] = T(e.initialLocale), [c, l] = T(e.initialTimezone), [u, d] = T(e.initialLanguage);
	return y(() => {
		a(e.initialLocale), l(e.initialTimezone), d(e.initialLanguage);
	}, [
		e.initialLocale,
		e.initialTimezone,
		e.initialLanguage
	]), /* @__PURE__ */ K("div", {
		className: "ic-regional-settings-container",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-regional-settings-header",
				children: [/* @__PURE__ */ G("div", {
					className: "ic-regional-settings-header-title",
					children: t("regional_settings.title")
				}), /* @__PURE__ */ G(J, {
					variant: "ghost",
					size: "xs",
					icon: /* @__PURE__ */ G(lt, {}),
					onClick: e.onClose,
					"aria-label": t("right_drawer.close")
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-regional-settings-content",
				children: [/* @__PURE__ */ K("div", {
					className: "ic-regional-settings-section",
					children: [/* @__PURE__ */ G("div", {
						className: "ic-regional-settings-section-title",
						children: t("regional_settings.locale.title")
					}), /* @__PURE__ */ K("div", {
						className: "ic-regional-settings-field-wrapper",
						children: [/* @__PURE__ */ G($n, {
							label: t("regional_settings.locale.locale_label"),
							value: i,
							onChange: a,
							options: n.map((e) => ({
								value: e,
								label: $a(e),
								triggerLabel: $a(e)
							}))
						}), /* @__PURE__ */ K("div", {
							className: "ic-regional-settings-helper-box",
							children: [
								/* @__PURE__ */ K("div", {
									className: "ic-regional-settings-row",
									children: [t("regional_settings.locale.locale_example1"), /* @__PURE__ */ G("span", {
										className: "ic-regional-settings-row-value",
										children: Qa[i]?.number ?? "1,234.56"
									})]
								}),
								/* @__PURE__ */ K("div", {
									className: "ic-regional-settings-row",
									children: [t("regional_settings.locale.locale_example2"), /* @__PURE__ */ G("span", {
										className: "ic-regional-settings-row-value",
										children: Qa[i]?.dateTime ?? "10/17/2026 09:21:06 PM"
									})]
								}),
								/* @__PURE__ */ K("div", {
									className: "ic-regional-settings-row",
									children: [t("regional_settings.locale.locale_example3"), /* @__PURE__ */ G("span", {
										className: "ic-regional-settings-row-value",
										children: (() => {
											let e = Qa[i]?.delimiterType ?? "comma", n = Qa[i]?.delimiterChar ?? ",";
											return `${t(`regional_settings.locale.delimiter_${e}`)} (${n})`;
										})()
									})]
								})
							]
						})]
					})]
				}), /* @__PURE__ */ K("div", {
					className: "ic-regional-settings-section",
					children: [/* @__PURE__ */ G("div", {
						className: "ic-regional-settings-section-title",
						children: t("regional_settings.timezone.title")
					}), /* @__PURE__ */ G("div", {
						className: "ic-regional-settings-field-wrapper",
						children: /* @__PURE__ */ G($n, {
							label: t("regional_settings.timezone.timezone_label"),
							helperText: t("regional_settings.timezone.timezone_helper"),
							value: c,
							onChange: l,
							options: r.map((e) => ({
								value: e,
								label: e,
								triggerLabel: e
							}))
						})
					})]
				})]
			}),
			/* @__PURE__ */ G("div", {
				className: "ic-regional-settings-footer",
				children: /* @__PURE__ */ G(q, {
					startIcon: /* @__PURE__ */ G(L, {}),
					onClick: () => {
						e.onSave(i, c, u), e.onClose();
					},
					children: t("num_fmt.save")
				})
			})
		]
	});
};
//#endregion
//#region src/components/RightDrawer/Themes/ThemePreview.tsx
function to(e, t, n, r) {
	let i = (r - 90) * Math.PI / 180;
	return [e + n * Math.cos(i), t + n * Math.sin(i)];
}
function no(e, t, n, r, i) {
	let [a, o] = to(e, t, n, r), [s, c] = to(e, t, n, i);
	return `M${e},${t} L${a},${o} A${n},${n},0,${+(i - r > 180)},1,${s},${c}Z`;
}
var ro = ({ theme: e, className: t }) => /* @__PURE__ */ G("div", {
	className: t,
	style: {
		backgroundColor: e.bgColor,
		color: e.textColor,
		"--theme-bg": e.bgColor
	},
	children: /* @__PURE__ */ K("div", {
		className: "ic-theme-preview-inner",
		children: [/* @__PURE__ */ G("span", { children: "Aa" }), /* @__PURE__ */ G("svg", {
			viewBox: "0 0 28 28",
			className: "ic-theme-preview-pie",
			"aria-hidden": "true",
			children: e.accentColors.map((e, t) => /* @__PURE__ */ G("path", {
				d: no(14, 14, 13, t * 60, (t + 1) * 60),
				fill: e
			}, t))
		})]
	})
}), io = ({ label: e, value: t, onChange: n, onKeyDown: r, currentTheme: i }) => {
	let { t: a } = D(), [o, s] = T(!1), c = w(null);
	return /* @__PURE__ */ K("div", {
		className: "ic-edit-theme-field-wrapper",
		children: [/* @__PURE__ */ G("span", {
			className: "ic-edit-theme-label",
			children: e
		}), /* @__PURE__ */ K("div", {
			className: "ic-edit-theme-color-row",
			children: [
				/* @__PURE__ */ G("div", {
					className: "ic-input-control md ic-edit-theme-color-swatch-wrapper",
					children: /* @__PURE__ */ G("button", {
						ref: c,
						type: "button",
						className: "ic-edit-theme-color-swatch",
						style: { backgroundColor: t },
						onClick: () => s(!0),
						"aria-label": e
					})
				}),
				/* @__PURE__ */ G(Y, {
					type: "text",
					value: t,
					onChange: (e) => n(e.target.value),
					onKeyDown: r
				}),
				/* @__PURE__ */ G(Zr, {
					color: t,
					defaultColor: t,
					title: a("color_picker.default"),
					onChange: (e) => {
						n(X(e, i)), s(!1);
					},
					onClose: () => s(!1),
					anchorEl: c,
					open: o,
					theme: i
				})
			]
		})]
	});
}, ao = ({ initialName: e, initialTextColor: t, initialBgColor: n, initialLightColor: r, initialDarkColor: i, initialAccentColors: a, initialHlinkColor: o, initialFolHlinkColor: s, onSave: c, onClose: l, currentTheme: u }) => {
	let { t: d } = D(), [f, p] = T(t), [m, h] = T(n), [g, _] = T(r), [v, y] = T(i), [b, x] = T(a), [S, C] = T(o), [w, E] = T(s), O = (e, t) => {
		x((n) => {
			let r = [...n];
			return r[e] = t, r;
		});
	}, k = () => {
		c({
			name: e,
			textColor: f,
			bgColor: m,
			lightColor: g,
			darkColor: v,
			accentColors: b,
			hlinkColor: S,
			folHlinkColor: w
		});
	}, A = (e) => {
		e.stopPropagation(), (e.metaKey || e.ctrlKey) && e.key === "Enter" && (e.preventDefault(), k());
	};
	return /* @__PURE__ */ K("div", {
		className: "ic-edit-theme-container",
		onKeyDown: A,
		children: [/* @__PURE__ */ K("div", {
			className: "ic-edit-theme-content-area",
			children: [
				/* @__PURE__ */ K("div", {
					className: "ic-edit-theme-header-box",
					children: [/* @__PURE__ */ G(ro, {
						theme: {
							bgColor: m,
							textColor: f,
							accentColors: b
						},
						className: "ic-edit-theme-preview"
					}), /* @__PURE__ */ G("span", {
						className: "ic-edit-theme-header-box-text",
						children: e
					})]
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-edit-theme-section",
					children: [/* @__PURE__ */ G(io, {
						label: d("themes.text_color_label"),
						value: f,
						onChange: p,
						onKeyDown: A,
						currentTheme: u
					}), /* @__PURE__ */ G(io, {
						label: d("themes.bg_color_label"),
						value: m,
						onChange: h,
						onKeyDown: A,
						currentTheme: u
					})]
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-edit-theme-section",
					children: [/* @__PURE__ */ G(io, {
						label: d("themes.dark_color_label"),
						value: v,
						onChange: y,
						onKeyDown: A,
						currentTheme: u
					}), /* @__PURE__ */ G(io, {
						label: d("themes.light_color_label"),
						value: g,
						onChange: _,
						onKeyDown: A,
						currentTheme: u
					})]
				}),
				/* @__PURE__ */ G("div", {
					className: "ic-edit-theme-section",
					children: b.map((e, t) => /* @__PURE__ */ G(io, {
						label: d("themes.accent_color_label", { n: t + 1 }),
						value: e,
						onChange: (e) => O(t, e),
						onKeyDown: A,
						currentTheme: u
					}, t))
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-edit-theme-section",
					children: [/* @__PURE__ */ G(io, {
						label: d("themes.hlink_color_label"),
						value: S,
						onChange: C,
						onKeyDown: A,
						currentTheme: u
					}), /* @__PURE__ */ G(io, {
						label: d("themes.fol_hlink_color_label"),
						value: w,
						onChange: E,
						onKeyDown: A,
						currentTheme: u
					})]
				})
			]
		}), /* @__PURE__ */ K("div", {
			className: "ic-edit-theme-footer",
			children: [/* @__PURE__ */ G(q, {
				variant: "secondary",
				onClick: l,
				children: d("themes.cancel")
			}), /* @__PURE__ */ G(q, {
				startIcon: /* @__PURE__ */ G(L, {}),
				onClick: k,
				children: d("themes.apply")
			})]
		})]
	});
}, oo = [
	"accent1",
	"accent2",
	"accent3",
	"accent4",
	"accent5",
	"accent6"
];
function so(e, t) {
	return e.name === t.name && oo.every((n) => e[n] === t[n]) && e.dk1 === t.dk1 && e.lt1 === t.lt1 && e.dk2 === t.dk2 && e.lt2 === t.lt2 && e.fol_hlink === t.fol_hlink && e.hlink === t.hlink;
}
//#endregion
//#region src/components/RightDrawer/Themes/themes.tsx
function co(e) {
	return {
		name: e.name,
		textColor: e.dk1,
		bgColor: e.lt1,
		darkColor: e.dk2,
		lightColor: e.lt2,
		accentColors: [
			e.accent1,
			e.accent2,
			e.accent3,
			e.accent4,
			e.accent5,
			e.accent6
		],
		hlinkColor: e.hlink,
		folHlinkColor: e.fol_hlink
	};
}
var lo = ({ themes: e, currentTheme: t, onThemePicked: n, onClose: r }) => {
	let { t: i } = D(), [a, o] = T(e), s = a;
	a.some((e) => so(e, t)) || (s = [...a, t]);
	let [c, l] = T(() => {
		let e = s.findIndex((e) => so(e, t));
		return e === -1 ? 0 : e;
	}), u = (e) => {
		l(e), n(s[e]);
	}, [d, f] = T(null), p = (e) => {
		if (d === null) return;
		let t = i("themes.custom_theme_name"), r = {
			...d,
			name: t,
			dk1: e.textColor,
			lt1: e.bgColor,
			dk2: e.darkColor,
			lt2: e.lightColor,
			accent1: e.accentColors[0],
			accent2: e.accentColors[1],
			accent3: e.accentColors[2],
			accent4: e.accentColors[3],
			accent5: e.accentColors[4],
			accent6: e.accentColors[5],
			hlink: e.hlinkColor,
			fol_hlink: e.folHlinkColor
		}, s = [r, ...a.filter((e) => e.name !== t)];
		o(s), l(0), n(r), f(null);
	};
	if (d) {
		let e = co(d);
		return /* @__PURE__ */ K("div", {
			className: "ic-themes-container",
			children: [/* @__PURE__ */ K("div", {
				className: "ic-themes-edit-header",
				children: [
					/* @__PURE__ */ G(Z, {
						title: i("themes.back_to_list"),
						children: /* @__PURE__ */ G(J, {
							icon: /* @__PURE__ */ G(P, {}),
							onClick: () => f(null),
							"aria-label": i("themes.back_to_list")
						})
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-themes-edit-header-title",
						children: i("themes.customize_theme")
					}),
					/* @__PURE__ */ G(Z, {
						title: i("right_drawer.close"),
						children: /* @__PURE__ */ G(J, {
							icon: /* @__PURE__ */ G(lt, {}),
							onClick: r,
							"aria-label": i("right_drawer.close")
						})
					})
				]
			}), /* @__PURE__ */ G("div", {
				className: "ic-themes-content",
				children: /* @__PURE__ */ G(ao, {
					initialName: e.name,
					initialTextColor: e.textColor,
					initialBgColor: e.bgColor,
					initialLightColor: e.lightColor,
					initialDarkColor: e.darkColor,
					initialAccentColors: e.accentColors,
					initialHlinkColor: e.hlinkColor,
					initialFolHlinkColor: e.folHlinkColor,
					currentTheme: t,
					onSave: p,
					onClose: () => f(null)
				})
			})]
		});
	}
	return /* @__PURE__ */ K("div", {
		className: "ic-themes-container",
		children: [/* @__PURE__ */ K("div", {
			className: "ic-themes-header",
			children: [/* @__PURE__ */ G("div", {
				className: "ic-themes-header-title",
				children: i("themes.panel_title")
			}), /* @__PURE__ */ G(Z, {
				title: i("right_drawer.close"),
				children: /* @__PURE__ */ G(J, {
					icon: /* @__PURE__ */ G(lt, {}),
					onClick: r,
					"aria-label": i("right_drawer.close")
				})
			})]
		}), /* @__PURE__ */ G("div", {
			className: "ic-themes-content",
			role: "listbox",
			"aria-label": i("themes.panel_title"),
			children: s.map((e, t) => /* @__PURE__ */ K("div", {
				className: `ic-themes-list-item${c === t ? " ic-themes-list-item--selected" : ""}`,
				role: "option",
				"aria-selected": c === t,
				"aria-label": e.name,
				tabIndex: 0,
				onClick: () => u(t),
				onKeyDown: (e) => {
					(e.key === "Enter" || e.key === " ") && (e.preventDefault(), u(t));
				},
				children: [
					/* @__PURE__ */ G(ro, {
						theme: co(e),
						className: "ic-themes-list-item-preview"
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-themes-list-item-name",
						children: e.name
					}),
					c === t && /* @__PURE__ */ G("div", {
						className: "ic-themes-list-item-icons",
						children: /* @__PURE__ */ G(Z, {
							title: i("themes.customize_theme"),
							children: /* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(Pe, {}),
								onClick: (t) => {
									t.stopPropagation(), f(e);
								},
								"aria-label": i("themes.customize_theme")
							})
						})
					})
				]
			}, t))
		})]
	});
}, uo = 16, fo = ({ isOpen: e, onClose: t, width: n, onWidthChange: r, getSelectedArea: i, model: a, onUpdate: o, drawerType: s, themes: c, currentTheme: l, onThemePicked: u, customStyles: d, builtinStyles: f, formatOptions: p, onApplyNamedStyle: m, onAddNamedStyle: h, onUpdateNamedStyle: g, onDeleteNamedStyle: v, initialLocale: b, initialTimezone: x, initialLanguage: S, onSettingsSave: C }) => {
	let [w, E] = T(n), [O, k] = T(!1), { t: A } = D(), j = _((e) => {
		e.preventDefault(), k(!0);
	}, []), M = _((e) => {
		let t = w;
		if (e.key === "ArrowLeft") t = Math.min(500, w + uo);
		else if (e.key === "ArrowRight") t = Math.max(300, w - uo);
		else if (e.key === "Home") t = 300;
		else if (e.key === "End") t = 500;
		else return;
		E(t), r(t);
	}, [w, r]);
	return y(() => {
		if (!O) return;
		document.body.style.userSelect = "none", document.body.style.cursor = "col-resize";
		let e = (e) => {
			let t = window.innerWidth - e.clientX, n = Math.max(300, Math.min(500, t));
			E(n), r(n);
		}, t = () => {
			k(!1), document.body.style.userSelect = "", document.body.style.cursor = "";
		};
		return document.addEventListener("mousemove", e), document.addEventListener("mouseup", t), () => {
			document.removeEventListener("mousemove", e), document.removeEventListener("mouseup", t), document.body.style.userSelect = "", document.body.style.cursor = "";
		};
	}, [O, r]), e ? /* @__PURE__ */ K("div", {
		className: "ic-drawer-container",
		style: { "--ic-runtime-drawer-width": `${w}px` },
		children: [
			/* @__PURE__ */ G("div", { className: "ic-drawer-divider" }),
			/* @__PURE__ */ G("div", {
				className: "ic-drawer-content",
				children: (() => {
					switch (s) {
						case "namedStyles": return /* @__PURE__ */ G(Xa, {
							model: a,
							onClose: t,
							customStyles: d,
							builtinStyles: f,
							formatOptions: p,
							currentTheme: l,
							onApplyNamedStyle: m,
							onAddNamedStyle: h,
							onUpdateNamedStyle: g,
							onDeleteNamedStyle: v
						});
						case "regionalSettings": return /* @__PURE__ */ G(eo, {
							onClose: t,
							initialLocale: b,
							initialTimezone: x,
							initialLanguage: S,
							onSave: C
						});
						case "conditionalFormatting": return /* @__PURE__ */ G(ma, {
							onClose: t,
							getSelectedArea: i,
							sheet: a.getSelectedView().sheet,
							onUpdate: o,
							model: a,
							currentTheme: l
						});
						case "themes": return /* @__PURE__ */ G(lo, {
							onClose: t,
							themes: c,
							currentTheme: l,
							onThemePicked: u
						});
						default: return /* @__PURE__ */ G(ya, {
							onClose: t,
							model: a,
							onUpdate: o,
							getSelectedArea: i
						});
					}
				})()
			}),
			/* @__PURE__ */ G("hr", {
				className: `ic-drawer-resize-handle ${O ? "ic-drawer-resize-handle--resizing" : ""}`,
				tabIndex: 0,
				"aria-label": A("right_drawer.resize_drawer"),
				"aria-orientation": "vertical",
				onMouseDown: j,
				onKeyDown: M
			})
		]
	}) : null;
};
//#endregion
//#region src/components/SheetTabBar/SheetListMenu.tsx
function po(e) {
	return ["#FFF", "#FFFFFF"].includes(e);
}
var mo = ({ onSheetSelected: e, sheetOptionsList: t, selectedIndex: n }) => {
	let r = w(null), i = t.some((e) => !po(e.color));
	return y(() => {
		let e = requestAnimationFrame(() => {
			(r.current?.querySelectorAll("[role=\"menuitemradio\"]"))?.[n]?.focus();
		});
		return () => cancelAnimationFrame(e);
	}, [n]), /* @__PURE__ */ G("div", {
		ref: r,
		children: t.map((t, r) => /* @__PURE__ */ G($, {
			checked: r === n,
			icon: i ? /* @__PURE__ */ G("span", {
				className: "ic-sheet-list-menu-color",
				style: { backgroundColor: t.color }
			}) : void 0,
			onClick: () => e(r),
			children: /* @__PURE__ */ G("span", {
				className: [r === n && "ic-sheet-list-menu-name--selected", t.state !== "visible" && "ic-sheet-list-menu-name--hidden"].filter(Boolean).join(" ") || void 0,
				children: t.name
			})
		}, t.sheetId))
	});
};
//#endregion
//#region src/components/SheetTabBar/SheetDeleteModal.tsx
function ho({ open: e, onClose: t, onDelete: n, sheetName: r }) {
	let { t: i } = D();
	return /* @__PURE__ */ G(Yt, {
		open: e,
		onClose: t,
		onConfirm: n,
		title: i("sheet_delete.title"),
		message: i("sheet_delete.message", { sheetName: r }),
		confirmLabel: i("sheet_delete.confirm"),
		cancelLabel: i("sheet_delete.cancel"),
		variant: "destructive"
	});
}
//#endregion
//#region src/components/Menu/MenuDivider.tsx
function go() {
	return /* @__PURE__ */ G("hr", { className: "ic-menu-divider" });
}
go.displayName = "MenuDivider";
//#endregion
//#region src/components/SheetTabBar/SheetTabMenu.tsx
function _o({ canDelete: e, onMoveLeft: t, onMoveRight: n, onStartEditing: r, onOpenColorPicker: i, onDuplicateSheet: a, onHideSheet: o, onDeleteSheet: s }) {
	let { t: c } = D();
	return /* @__PURE__ */ K(W, { children: [
		/* @__PURE__ */ G($, {
			icon: /* @__PURE__ */ G(P, {}),
			onClick: t,
			children: c("sheet_tab.move_left")
		}),
		/* @__PURE__ */ G($, {
			icon: /* @__PURE__ */ G(F, {}),
			onClick: n,
			children: c("sheet_tab.move_right")
		}),
		/* @__PURE__ */ G($, {
			icon: /* @__PURE__ */ G(et, {}),
			onClick: r,
			children: c("sheet_tab.rename")
		}),
		/* @__PURE__ */ G($, {
			icon: /* @__PURE__ */ G(Me, {}),
			onClick: i,
			children: c("sheet_tab.change_color")
		}),
		/* @__PURE__ */ G($, {
			icon: /* @__PURE__ */ G(V, {}),
			onClick: a,
			children: c("sheet_tab.duplicate")
		}),
		/* @__PURE__ */ G($, {
			icon: /* @__PURE__ */ G(he, {}),
			disabled: !e,
			onClick: o,
			children: c("sheet_tab.hide_sheet")
		}),
		/* @__PURE__ */ G(go, {}),
		/* @__PURE__ */ G($, {
			icon: /* @__PURE__ */ G(rt, {}),
			disabled: !e,
			destructive: !0,
			onClick: s,
			children: c("sheet_tab.delete")
		})
	] });
}
//#endregion
//#region src/components/SheetTabBar/SheetTab.tsx
function vo(e) {
	let { name: t, color: n, selected: r, workbookState: i, onSelected: a, currentTheme: o, model: s, onMoveSheet: c } = e, { t: l } = D(), [u, d] = T(!1), [f, p] = T({
		x: 0,
		y: 0
	}), [m, h] = T(!1), [g, _] = T(!1), [v, b] = T(!1), [x, C] = T(t), [E, O] = T(0), k = w(null), A = w(null), j = w(null), M = w(null);
	y(() => {
		v && j.current && (j.current.focus(), j.current.select());
	}, [v]), y(() => {
		v || C(t);
	}, [t, v]), S(() => {
		if (v && M.current) {
			let e = M.current.offsetWidth;
			O(Math.max(e + 8, 6));
		}
	}, [x, v]);
	function N() {
		let e = k.current?.getBoundingClientRect();
		return e ? {
			x: e.right - 24,
			y: e.top
		} : {
			x: 0,
			y: 0
		};
	}
	let ee = (t) => {
		e.canEdit && (t.stopPropagation(), t.preventDefault(), u ? (d(!1), requestAnimationFrame(() => A.current?.focus())) : (a(), p(N()), d(!0)));
	}, P = (t) => {
		e.canEdit && (t.preventDefault(), t.stopPropagation(), a(), p(N()), d(!0));
	}, F = () => {
		d(!1), requestAnimationFrame(() => A.current?.focus());
	}, I = () => {
		e.canEdit && (C(t), O(Math.max(t.length * 7 + 8, 6)), b(!0));
	}, te = () => {
		x.trim() === "" ? (C(t), b(!1)) : (e.onRenamed(x.trim()), b(!1));
	}, ne = () => {
		C(t), b(!1);
	};
	return /* @__PURE__ */ K(W, { children: [
		/* @__PURE__ */ G("div", {
			className: `ic-sheet-tab${r ? " ic-sheet-tab--selected" : ""}`,
			style: { borderBottomColor: n },
			role: "tab",
			tabIndex: r ? 0 : -1,
			"aria-selected": r,
			onClick: (e) => {
				v || a(), e.stopPropagation(), e.preventDefault();
			},
			onKeyDown: (e) => {},
			onDoubleClick: (e) => {
				e.stopPropagation(), e.preventDefault(), I();
			},
			onContextMenu: P,
			onPointerDown: (e) => {
				let t = i.getEditingCell();
				t && bn(s, t.text, t.cursorStart) && (e.stopPropagation(), e.preventDefault());
			},
			ref: k,
			children: v ? /* @__PURE__ */ K(W, { children: [
				/* @__PURE__ */ G("span", {
					className: "ic-sheet-tab-hidden-measure",
					ref: M,
					children: x || " "
				}),
				/* @__PURE__ */ G("input", {
					ref: j,
					value: x,
					onChange: (e) => C(e.target.value),
					style: { width: `${E}px` },
					className: "ic-sheet-tab-input",
					"aria-label": l("sheet_tab.rename"),
					onKeyDown: (e) => {
						e.key === "Enter" ? (e.preventDefault(), te()) : e.key === "Escape" && (e.preventDefault(), ne()), e.stopPropagation();
					},
					onBlur: () => {
						te();
					},
					onClick: (e) => e.stopPropagation(),
					spellCheck: !1
				}),
				/* @__PURE__ */ G("button", {
					className: "ic-sheet-tab-menu-button",
					disabled: !0,
					type: "button",
					"aria-hidden": "true",
					children: /* @__PURE__ */ G(R, {})
				})
			] }) : /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G("div", {
				className: "ic-sheet-tab-name",
				children: t
			}), e.canEdit && /* @__PURE__ */ G("button", {
				ref: A,
				className: `ic-sheet-tab-menu-button${u ? " ic-sheet-tab-menu-button--active" : ""}`,
				onClick: ee,
				type: "button",
				"aria-label": l("sheet_tab.open_menu"),
				"aria-haspopup": "menu",
				"aria-expanded": u,
				children: /* @__PURE__ */ G(R, {})
			})] })
		}),
		/* @__PURE__ */ G(Oa, {
			open: u,
			onClose: F,
			anchorPosition: f,
			children: /* @__PURE__ */ G(_o, {
				canDelete: e.canDelete,
				onStartEditing: I,
				onOpenColorPicker: () => h(!0),
				onDuplicateSheet: e.onDuplicateSheet,
				onHideSheet: e.onHideSheet,
				onDeleteSheet: () => _(!0),
				onMoveLeft: () => {
					let e = s.getSelectedSheet();
					e > 0 && c(e, e - 1), F();
				},
				onMoveRight: () => {
					let e = s.getSelectedSheet();
					e < s.getWorksheetsProperties().length - 1 && c(e, e + 1), F();
				}
			})
		}),
		/* @__PURE__ */ G(Zr, {
			color: n,
			defaultColor: "#FFFFFF",
			title: l("color_picker.no_fill"),
			onChange: (t) => {
				e.onColorChanged(t), h(!1);
			},
			onClose: () => {
				h(!1);
			},
			anchorEl: k,
			open: m,
			placement: "top",
			theme: o
		}),
		/* @__PURE__ */ G(ho, {
			open: g,
			onClose: () => _(!1),
			onDelete: () => {
				e.onDeleted(), _(!1);
			},
			sheetName: t
		})
	] });
}
//#endregion
//#region src/components/SheetTabBar/SheetTabBar.tsx
function yo(e) {
	let { t } = D(), { workbookState: n, onSheetSelected: r, sheets: i, selectedIndex: a } = e, o = i.map((e, t) => ({
		state: e.state,
		index: t,
		name: e.name,
		color: e.color,
		sheetId: e.sheetId
	})).filter((e) => e.state === "visible");
	return /* @__PURE__ */ K("div", {
		className: "ic-sheet-tab-bar-container",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-sheet-tab-bar-left-buttons-container",
				children: [e.canEdit && /* @__PURE__ */ G(Z, {
					title: t("navigation.add_sheet"),
					children: /* @__PURE__ */ G(J, {
						"aria-label": t("navigation.add_sheet"),
						icon: /* @__PURE__ */ G(Ie, {}),
						onClick: e.onAddBlankSheet
					})
				}), /* @__PURE__ */ G(Z, {
					title: t("navigation.sheet_list"),
					children: /* @__PURE__ */ G(Oa, {
						trigger: /* @__PURE__ */ G(J, {
							"aria-label": t("navigation.sheet_list"),
							icon: /* @__PURE__ */ G(De, {})
						}),
						children: /* @__PURE__ */ G(mo, {
							sheetOptionsList: i,
							onSheetSelected: r,
							selectedIndex: a
						})
					})
				})]
			}),
			/* @__PURE__ */ G("div", { className: "ic-sheet-tab-bar-vertical-divider" }),
			/* @__PURE__ */ G("div", {
				className: "ic-sheet-tab-bar-sheets",
				children: /* @__PURE__ */ G("div", {
					className: "ic-sheet-tab-bar-sheet-inner",
					children: o.map((t) => /* @__PURE__ */ G(vo, {
						canEdit: e.canEdit,
						name: t.name,
						color: t.color,
						selected: t.index === a,
						onSelected: () => r(t.index),
						onColorChanged: (t) => {
							e.onSheetColorChanged(t);
						},
						onRenamed: (t) => {
							e.onSheetRenamed(t);
						},
						canDelete: o.length > 1,
						onDeleted: () => {
							e.onSheetDeleted();
						},
						onDuplicateSheet: () => {
							e.onSheetDuplicated();
						},
						onHideSheet: e.onHideSheet,
						workbookState: n,
						model: e.model,
						currentTheme: e.model.getTheme(),
						onMoveSheet: e.onMoveSheet
					}, t.sheetId))
				})
			}),
			e.canEdit && /* @__PURE__ */ K("div", {
				className: "ic-sheet-tab-bar-right-container",
				children: [/* @__PURE__ */ G(Z, {
					title: t("regional_settings.open_regional_settings"),
					children: /* @__PURE__ */ K(q, {
						className: "ic-sheet-tab-bar-regional-settings-button",
						variant: "ghost",
						size: "sm",
						onClick: () => {
							e.onOpenRegionalSettings();
						},
						children: [
							$a(e.model.getLocale()),
							/* @__PURE__ */ G("div", { className: "ic-sheet-tab-bar-text-divider" }),
							t(`regional_settings.language.display_language.${e.model.getLanguage()}`)
						]
					})
				}), /* @__PURE__ */ G(Z, {
					title: t("regional_settings.open_regional_settings"),
					children: /* @__PURE__ */ G(J, {
						className: "ic-sheet-tab-bar-regional-settings-icon-button",
						"aria-label": t("regional_settings.open_regional_settings"),
						icon: /* @__PURE__ */ G(We, {}),
						onClick: e.onOpenRegionalSettings
					})
				})]
			})
		]
	});
}
//#endregion
//#region src/components/BorderPicker/BorderPicker.tsx
var bo = [
	{
		value: n.All,
		labelKey: "toolbar.borders.all",
		icon: _e,
		offValue: null
	},
	{
		value: n.Inner,
		labelKey: "toolbar.borders.inner",
		icon: yt,
		offValue: null
	},
	{
		value: n.CenterH,
		labelKey: "toolbar.borders.horizontal",
		icon: _t,
		offValue: null
	},
	{
		value: n.CenterV,
		labelKey: "toolbar.borders.vertical",
		icon: vt,
		offValue: null
	},
	{
		value: n.Outer,
		labelKey: "toolbar.borders.outer",
		icon: St,
		offValue: n.None
	},
	{
		value: n.None,
		labelKey: "toolbar.borders.clear",
		icon: xt,
		offValue: n.None
	},
	{
		value: n.Top,
		labelKey: "toolbar.borders.top",
		icon: wt,
		offValue: n.None
	},
	{
		value: n.Right,
		labelKey: "toolbar.borders.right",
		icon: Ct,
		offValue: n.None
	},
	{
		value: n.Bottom,
		labelKey: "toolbar.borders.bottom",
		icon: gt,
		offValue: n.None
	},
	{
		value: n.Left,
		labelKey: "toolbar.borders.left",
		icon: bt,
		offValue: n.None
	}
];
function xo({ onChange: e, onClose: r, anchorEl: i, open: a, currentTheme: o }) {
	let { t: s } = D(), c = w(null), l = w(null), [u, d] = T(null), [f, p] = T(null), [m, h] = T(""), [g, _] = T(t.Thin), [v, b] = T(!1), [x, C] = T(!1);
	S(() => {
		if (!a || !i.current) return;
		let e = () => {
			if (!i.current) return;
			let e = i.current.getBoundingClientRect();
			d({
				top: e.bottom + 4,
				left: e.left - 4
			});
		};
		return e(), window.addEventListener("resize", e), window.addEventListener("scroll", e, !0), () => {
			window.removeEventListener("resize", e), window.removeEventListener("scroll", e, !0);
		};
	}, [i, a]), y(() => {
		if (!a) return;
		let e = (e) => {
			if (e.key === "Escape") {
				if (e.preventDefault(), e.stopPropagation(), v) {
					b(!1);
					return;
				}
				if (x) {
					C(!1);
					return;
				}
				r();
			}
			e.preventDefault(), e.stopPropagation();
		};
		return document.addEventListener("keydown", e, !0), () => {
			document.removeEventListener("keydown", e, !0);
		};
	}, [
		a,
		r,
		v,
		x
	]), y(() => {
		a || (p(null), h(""), _(t.Thin), b(!1), C(!1));
	}, [a]), y(() => {
		if (!a) return;
		let e = (e) => {
			let t = e.target;
			t && c.current?.contains(t) || v || r();
		};
		return document.addEventListener("pointerdown", e, !0), () => {
			document.removeEventListener("pointerdown", e, !0);
		};
	}, [
		a,
		r,
		v
	]);
	let E = (t, n, r) => {
		e({
			color: n || void 0,
			style: r,
			border: t
		});
	}, O = (e, t) => {
		let n = f === e ? t : e;
		p(n), n !== null && E(n, m, g);
	};
	return !a || !i.current ? null : /* @__PURE__ */ K("div", {
		ref: c,
		className: "ic-border-picker",
		style: u ? {
			top: `${u.top}px`,
			left: `${u.left}px`
		} : void 0,
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-border-picker__borders",
				children: [/* @__PURE__ */ G("div", {
					className: "row",
					children: bo.slice(0, 5).map((e) => {
						let t = e.icon, n = e.value;
						return /* @__PURE__ */ G(J, {
							pressed: f === n,
							"aria-label": s(e.labelKey),
							title: s(e.labelKey),
							icon: /* @__PURE__ */ G(t, {}),
							onClick: () => O(n, e.offValue)
						}, n);
					})
				}), /* @__PURE__ */ G("div", {
					className: "row",
					children: bo.slice(5).map((e) => {
						let t = e.icon, r = e.value;
						return /* @__PURE__ */ G(J, {
							pressed: f === r,
							"aria-label": s(e.labelKey),
							title: s(e.labelKey),
							icon: /* @__PURE__ */ G(t, {}),
							onClick: () => {
								r === n.None ? (p(n.None), E(n.None, m, g)) : O(r, e.offValue);
							}
						}, r);
					})
				})]
			}),
			/* @__PURE__ */ G("div", { className: "divider" }),
			/* @__PURE__ */ K("div", {
				className: "ic-border-picker__menu",
				children: [/* @__PURE__ */ K("div", {
					className: "ic-border-picker__submenu-anchor",
					onClick: () => b((e) => !e),
					children: [/* @__PURE__ */ K("button", {
						ref: l,
						type: "button",
						className: "ic-border-picker__button",
						children: [
							/* @__PURE__ */ G(Pe, {}),
							/* @__PURE__ */ G("span", { children: s("toolbar.borders.color") }),
							/* @__PURE__ */ G(oe, {})
						]
					}), /* @__PURE__ */ G(Zr, {
						color: m,
						defaultColor: "",
						defaultSwatchColor: "var(--palette-sheet-default-text-color)",
						title: s("color_picker.default"),
						onChange: (e) => {
							h(e), b(!1), f && E(f, e, g);
						},
						onClose: () => {
							b(!1);
						},
						anchorEl: l,
						open: v,
						placement: "right",
						theme: o
					})]
				}), /* @__PURE__ */ K("div", {
					className: "ic-border-picker__submenu-anchor",
					onMouseEnter: () => C(!0),
					onMouseLeave: () => C(!1),
					children: [/* @__PURE__ */ K("button", {
						type: "button",
						className: "ic-border-picker__button",
						children: [
							/* @__PURE__ */ G(we, {}),
							/* @__PURE__ */ G("span", { children: s("toolbar.borders.style") }),
							/* @__PURE__ */ G(oe, {})
						]
					}), x && /* @__PURE__ */ G(xa, {
						value: g,
						onSelect: (e) => {
							_(e), C(!1), f && E(f, m, e);
						}
					})]
				})]
			})
		]
	});
}
//#endregion
//#region src/components/FormatMenu/FormatPicker.tsx
var So = (e) => {
	let { t } = D();
	return /* @__PURE__ */ G(Xt, {
		open: e.open,
		onClose: e.onClose,
		onSubmit: e.onChange,
		title: t("num_fmt.title"),
		className: e.className,
		defaultValue: e.numFmt,
		cancelLabel: t("num_fmt.cancel"),
		confirmLabel: t("num_fmt.save"),
		closeLabel: t("num_fmt.close")
	});
};
//#endregion
//#region src/components/FormatMenu/FormatMenu.tsx
function Co({ numFmt: e, onChange: t, formatOptions: n, onOpenPicker: r, previousFocusedElementRef: i }) {
	let { t: a } = D();
	function o(e) {
		t(e);
		let n = i.current;
		requestAnimationFrame(() => n?.focus());
	}
	let s = e === Q.AUTO, c = e === n.number_fmt, l = e === Q.PERCENTAGE, u = e === Q.CURRENCY_EUR, d = e === Q.CURRENCY_USD, f = e === Q.CURRENCY_GBP, p = e === n.short_date, m = e === n.long_date, h = !(s || c || l || u || d || f || p || m);
	return /* @__PURE__ */ K(W, { children: [
		/* @__PURE__ */ G($, {
			checked: s,
			onClick: () => o(Q.AUTO),
			children: a("toolbar.format_menu.auto")
		}),
		/* @__PURE__ */ G(go, {}),
		/* @__PURE__ */ G($, {
			checked: c,
			onClick: () => o(n.number_fmt),
			secondaryText: n.number_example,
			children: a("toolbar.format_menu.number")
		}),
		/* @__PURE__ */ G($, {
			checked: l,
			onClick: () => o(Q.PERCENTAGE),
			secondaryText: a("toolbar.format_menu.percentage_example"),
			children: a("toolbar.format_menu.percentage")
		}),
		/* @__PURE__ */ G(go, {}),
		/* @__PURE__ */ G($, {
			checked: u,
			onClick: () => o(Q.CURRENCY_EUR),
			secondaryText: a("toolbar.format_menu.currency_eur_example"),
			children: a("toolbar.format_menu.currency_eur")
		}),
		/* @__PURE__ */ G($, {
			checked: d,
			onClick: () => o(Q.CURRENCY_USD),
			secondaryText: a("toolbar.format_menu.currency_usd_example"),
			children: a("toolbar.format_menu.currency_usd")
		}),
		/* @__PURE__ */ G($, {
			checked: f,
			onClick: () => o(Q.CURRENCY_GBP),
			secondaryText: a("toolbar.format_menu.currency_gbp_example"),
			children: a("toolbar.format_menu.currency_gbp")
		}),
		/* @__PURE__ */ G(go, {}),
		/* @__PURE__ */ G($, {
			checked: p,
			onClick: () => o(n.short_date),
			secondaryText: n.short_date_example,
			children: a("toolbar.format_menu.date_short")
		}),
		/* @__PURE__ */ G($, {
			checked: m,
			onClick: () => o(n.long_date),
			secondaryText: n.long_date_example,
			children: a("toolbar.format_menu.date_long")
		}),
		/* @__PURE__ */ G(go, {}),
		/* @__PURE__ */ G($, {
			checked: h,
			onClick: r,
			children: a("toolbar.format_menu.custom")
		})
	] });
}
var wo = (e) => {
	let [t, n] = T(!1), r = w(null);
	return /* @__PURE__ */ K("div", {
		className: "ic-format-menu-root",
		children: [/* @__PURE__ */ G(Oa, {
			trigger: /* @__PURE__ */ G("div", {
				className: "ic-format-menu-anchor",
				onMouseDownCapture: () => {
					r.current = document.activeElement;
				},
				children: e.children
			}),
			children: /* @__PURE__ */ G(Co, {
				numFmt: e.numFmt,
				onChange: e.onChange,
				formatOptions: e.formatOptions,
				onOpenPicker: () => n(!0),
				previousFocusedElementRef: r
			})
		}), /* @__PURE__ */ G(So, {
			numFmt: e.numFmt,
			onChange: (t) => {
				e.onChange(t), requestAnimationFrame(() => r.current?.focus());
			},
			open: t,
			onClose: () => n(!1)
		})]
	});
}, To = [
	"accent1",
	"accent2",
	"accent3",
	"accent4",
	"accent5",
	"accent6"
], Eo = ({ children: e, themes: t, currentTheme: n, onChange: r, onManageThemes: i }) => {
	let { t: a } = D(), o = t;
	return t.some((e) => so(e, n)) || (o = [...t, n]), /* @__PURE__ */ K(Oa, {
		trigger: /* @__PURE__ */ G("div", {
			className: "ic-format-menu-anchor",
			children: e
		}),
		children: [
			o.map((e) => {
				let t = so(e, n), i = t ? " (current)" : "", a = `${e.name}${i}`;
				return /* @__PURE__ */ G($, {
					onClick: () => r(e),
					checked: t,
					secondaryText: /* @__PURE__ */ G("span", {
						className: "ic-theme-menu-swatches",
						children: To.map((t) => /* @__PURE__ */ G("span", {
							className: "ic-theme-menu-swatch",
							style: { backgroundColor: e[t] }
						}, t))
					}),
					children: e.name
				}, a);
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(We, {}),
				onClick: i,
				children: a("themes.manage_themes")
			})
		]
	});
};
//#endregion
//#region src/components/Toolbar/Toolbar.tsx
function Do(e) {
	let [t, n] = T(!1), [r, i] = T(!1), [a, o] = T(!1), [s, c] = T(!1), [l, u] = T(!1), [d, f] = T(`${e.fontSize}`), p = w(null), m = w(null), h = w(null), g = w(null), v = w(null), b = w(!1), { t: x } = D(), { canEdit: S, currentTheme: C, mergeCellsState: E } = e;
	y(() => {
		f(`${e.fontSize}`);
	}, [e.fontSize]);
	let M = () => g.current?.scrollBy({
		left: -200,
		behavior: "smooth"
	}), N = () => g.current?.scrollBy({
		left: 200,
		behavior: "smooth"
	}), P = _(() => {
		if (!g.current) return;
		let { scrollLeft: e, scrollWidth: t, clientWidth: n } = g.current;
		c(e > 0), u(e < t - n);
	}, []);
	y(() => {
		let e = g.current;
		if (e) return P(), e.addEventListener("scroll", P), () => e.removeEventListener("scroll", P);
	}, [P]);
	let F;
	switch (e.formatOptions.currency) {
		case "EUR":
			F = /* @__PURE__ */ G(H, {});
			break;
		case "USD":
			F = /* @__PURE__ */ G(pe, {});
			break;
		case "GBP": F = /* @__PURE__ */ G(Le, {});
	}
	return /* @__PURE__ */ K("div", {
		className: "ic-toolbar-wrapper",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-toolbar-container",
				ref: g,
				children: [
					/* @__PURE__ */ K("div", {
						className: "ic-toolbar-button-group",
						children: [/* @__PURE__ */ G(Z, {
							title: x("toolbar.undo"),
							children: /* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(st, {}),
								"aria-label": x("toolbar.undo"),
								onClick: e.onUndo,
								disabled: !e.canUndo
							})
						}), /* @__PURE__ */ G(Z, {
							title: x("toolbar.redo"),
							children: /* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(Re, {}),
								"aria-label": x("toolbar.redo"),
								onClick: e.onRedo,
								disabled: !e.canRedo
							})
						})]
					}),
					/* @__PURE__ */ G("div", { className: "ic-toolbar-divider" }),
					/* @__PURE__ */ K("div", {
						className: "ic-toolbar-button-group",
						children: [/* @__PURE__ */ G(Z, {
							title: x("toolbar.copy_styles"),
							children: /* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(Ne, {}),
								"aria-label": x("toolbar.copy_styles"),
								onClick: e.onCopyStyles
							})
						}), /* @__PURE__ */ G(Z, {
							title: x("toolbar.clear_formatting"),
							children: /* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(ze, {}),
								"aria-label": x("toolbar.clear_formatting"),
								onClick: () => {
									e.onClearFormatting();
								},
								disabled: !S
							})
						})]
					}),
					/* @__PURE__ */ G("div", { className: "ic-toolbar-divider" }),
					/* @__PURE__ */ K("div", {
						className: "ic-toolbar-button-group",
						children: [
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.currency"),
								children: /* @__PURE__ */ G(J, {
									icon: F,
									"aria-label": x("toolbar.currency"),
									onClick: () => {
										e.onNumberFormatPicked(e.formatOptions.currency_format);
									},
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.percentage"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(Fe, {}),
									"aria-label": x("toolbar.percentage"),
									onClick: () => {
										e.onNumberFormatPicked(Q.PERCENTAGE);
									},
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.decimal_places_decrease"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(ue, {}),
									"aria-label": x("toolbar.decimal_places_decrease"),
									onClick: () => {
										e.onNumberFormatPicked(Ca(e.numFmt));
									},
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.decimal_places_increase"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(de, {}),
									"aria-label": x("toolbar.decimal_places_increase"),
									onClick: () => {
										e.onNumberFormatPicked(Sa(e.numFmt));
									},
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(wo, {
								numFmt: e.numFmt,
								onChange: (t) => {
									e.onNumberFormatPicked(t);
								},
								formatOptions: e.formatOptions,
								children: /* @__PURE__ */ G(Z, {
									title: x("toolbar.format_number"),
									children: /* @__PURE__ */ G(q, {
										variant: "ghost",
										size: "sm",
										disabled: !S,
										style: {
											gap: 0,
											paddingLeft: 4,
											paddingRight: 2
										},
										endIcon: /* @__PURE__ */ G(R, { size: 12 }),
										children: "123"
									})
								})
							})
						]
					}),
					/* @__PURE__ */ G("div", { className: "ic-toolbar-divider" }),
					/* @__PURE__ */ K("div", {
						className: "ic-toolbar-button-group",
						children: [
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.decrease_font_size"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(Oe, {}),
									"aria-label": x("toolbar.decrease_font_size"),
									onClick: () => {
										e.onIncreaseFontSize(-1);
									},
									disabled: !S
								})
							}),
							/* @__PURE__ */ G("input", {
								ref: v,
								className: "ic-toolbar-font-size-box",
								type: "text",
								inputMode: "numeric",
								"aria-label": x("toolbar.font_size"),
								value: d,
								disabled: !S,
								onClick: (e) => {
									e.stopPropagation(), e.currentTarget.select();
								},
								onFocus: (e) => e.target.select(),
								onChange: (e) => f(e.target.value),
								onBlur: () => {
									if (b.current) {
										b.current = !1;
										return;
									}
									let t = Number(d.trim());
									Number.isInteger(t) && t > 0 && t <= 400 ? e.onSetFontSize(t) : f(`${e.fontSize}`);
								},
								onKeyDown: (t) => {
									if (t.key === "Enter") t.currentTarget.blur();
									else if (t.key === "Escape") b.current = !0, f(`${e.fontSize}`), t.currentTarget.blur();
									else if (t.key === "ArrowUp" || t.key === "ArrowDown") {
										t.preventDefault();
										let n = Number(d.trim());
										if (Number.isInteger(n)) {
											let r = t.shiftKey ? 10 : 1, i = t.key === "ArrowUp" ? Math.min(n + r, 400) : Math.max(n - r, 1);
											f(`${i}`), e.onSetFontSize(i), requestAnimationFrame(() => v.current?.focus());
										}
									}
								}
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.increase_font_size"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(Ie, {}),
									"aria-label": x("toolbar.increase_font_size"),
									onClick: () => {
										e.onIncreaseFontSize(1);
									},
									disabled: !S
								})
							})
						]
					}),
					/* @__PURE__ */ G("div", { className: "ic-toolbar-divider" }),
					/* @__PURE__ */ K("div", {
						className: "ic-toolbar-button-group",
						children: [
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.bold"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(re, {}),
									"aria-label": x("toolbar.bold"),
									pressed: e.bold,
									onClick: () => e.onToggleBold(!e.bold),
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.italic"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(Se, {}),
									"aria-label": x("toolbar.italic"),
									pressed: e.italic,
									onClick: () => e.onToggleItalic(!e.italic),
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.underline"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(ot, {}),
									"aria-label": x("toolbar.underline"),
									pressed: e.underline,
									onClick: () => e.onToggleUnderline(!e.underline),
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.strike_through"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(Ye, {}),
									"aria-label": x("toolbar.strike_through"),
									pressed: e.strike,
									onClick: () => e.onToggleStrike(!e.strike),
									disabled: !S
								})
							})
						]
					}),
					/* @__PURE__ */ G("div", { className: "ic-toolbar-divider" }),
					/* @__PURE__ */ K("div", {
						className: "ic-toolbar-button-group",
						children: [
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.font_color"),
								children: /* @__PURE__ */ G(J, {
									type: "button",
									pressed: t,
									disabled: !S,
									ref: p,
									"aria-label": x("toolbar.font_color"),
									onClick: () => n(!0),
									icon: /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G(at, {}), /* @__PURE__ */ G("div", {
										className: "ic-toolbar-color-line",
										style: { backgroundColor: X(e.fontColor, C) || "var(--palette-sheet-default-text-color)" }
									})] })
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.fill_color"),
								children: /* @__PURE__ */ G(J, {
									type: "button",
									pressed: r,
									disabled: !S,
									ref: m,
									"aria-label": x("toolbar.fill_color"),
									onClick: () => i(!0),
									icon: /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G(Me, {}), /* @__PURE__ */ G("div", {
										className: "ic-toolbar-color-line",
										style: { backgroundColor: X(e.fillColor, C) || "var(--palette-common-white)" }
									})] })
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.borders.title"),
								children: /* @__PURE__ */ G(J, {
									type: "button",
									pressed: a,
									ref: h,
									"aria-label": x("toolbar.borders.title"),
									onClick: () => o(!0),
									disabled: !S,
									icon: /* @__PURE__ */ G(_e, {})
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.conditional_formatting"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(ie, {}),
									"aria-label": x("toolbar.conditional_formatting"),
									pressed: e.isConditionalFormattingOpen,
									onClick: e.onOpenConditionalFormatting,
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Eo, {
								themes: e.themes,
								currentTheme: e.currentTheme,
								onChange: e.onThemePicked,
								onManageThemes: e.onOpenThemes,
								children: /* @__PURE__ */ G(Z, {
									title: x("toolbar.themes"),
									children: /* @__PURE__ */ G(J, {
										icon: /* @__PURE__ */ G(Xe, {}),
										"aria-label": x("toolbar.themes"),
										disabled: !S
									})
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.named_styles"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(Ce, {}),
									"aria-label": x("toolbar.named_styles"),
									pressed: e.isNamedStylesOpen,
									onClick: e.onOpenNamedStyles,
									disabled: !S
								})
							})
						]
					}),
					/* @__PURE__ */ G("div", { className: "ic-toolbar-divider" }),
					/* @__PURE__ */ K("div", {
						className: "ic-toolbar-button-group",
						children: [
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.align_left"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(A, {}),
									"aria-label": x("toolbar.align_left"),
									pressed: e.horizontalAlign === "left",
									onClick: () => e.onToggleHorizontalAlign(e.horizontalAlign === "left" ? "general" : "left"),
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.align_center"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(O, {}),
									"aria-label": x("toolbar.align_center"),
									pressed: e.horizontalAlign === "center",
									onClick: () => e.onToggleHorizontalAlign(e.horizontalAlign === "center" ? "general" : "center"),
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.align_right"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(j, {}),
									"aria-label": x("toolbar.align_right"),
									pressed: e.horizontalAlign === "right",
									onClick: () => e.onToggleHorizontalAlign(e.horizontalAlign === "right" ? "general" : "right"),
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.vertical_align_top"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(ne, {}),
									"aria-label": x("toolbar.vertical_align_top"),
									pressed: e.verticalAlign === "top",
									onClick: () => e.onToggleVerticalAlign("top"),
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.vertical_align_middle"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(ht, {}),
									"aria-label": x("toolbar.vertical_align_middle"),
									pressed: e.verticalAlign === "center",
									onClick: () => e.onToggleVerticalAlign("center"),
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.vertical_align_bottom"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(ee, {}),
									"aria-label": x("toolbar.vertical_align_bottom"),
									pressed: e.verticalAlign === "bottom",
									onClick: () => e.onToggleVerticalAlign("bottom"),
									disabled: !S
								})
							}),
							/* @__PURE__ */ G(Z, {
								title: x("toolbar.wrap_text"),
								children: /* @__PURE__ */ G(J, {
									icon: /* @__PURE__ */ G(ct, {}),
									"aria-label": x("toolbar.wrap_text"),
									pressed: e.wrapText,
									onClick: () => e.onToggleWrapText(!e.wrapText),
									disabled: !S
								})
							}),
							/* @__PURE__ */ K(Oa, {
								trigger: /* @__PURE__ */ G("div", {
									className: "ic-toolbar-menu-anchor",
									children: /* @__PURE__ */ G(Z, {
										title: x("toolbar.merge_cells"),
										children: /* @__PURE__ */ G(q, {
											variant: "ghost",
											size: "sm",
											"aria-label": x("toolbar.merge_cells"),
											disabled: !S || !(E.canMerge || E.canUnmerge),
											style: {
												gap: 0,
												paddingLeft: 4,
												paddingRight: 2
											},
											startIcon: /* @__PURE__ */ G(Ze, {}),
											endIcon: /* @__PURE__ */ G(R, { size: 12 })
										})
									})
								}),
								children: [
									/* @__PURE__ */ G($, {
										icon: /* @__PURE__ */ G(Ze, {}),
										disabled: !E.canMerge,
										onClick: () => e.onMergeCells("merge"),
										children: x("toolbar.merge_menu.merge")
									}),
									/* @__PURE__ */ G($, {
										icon: /* @__PURE__ */ G(k, {}),
										disabled: !E.canMerge,
										onClick: () => e.onMergeCells("merge_center"),
										children: x("toolbar.merge_menu.merge_center")
									}),
									/* @__PURE__ */ G($, {
										icon: /* @__PURE__ */ G(Be, {}),
										disabled: !E.canMergeAcross,
										onClick: () => e.onMergeCells("merge_across"),
										children: x("toolbar.merge_menu.merge_across")
									}),
									/* @__PURE__ */ G($, {
										icon: /* @__PURE__ */ G(B, {}),
										disabled: !E.canMergeDown,
										onClick: () => e.onMergeCells("merge_down"),
										children: x("toolbar.merge_menu.merge_down")
									}),
									/* @__PURE__ */ G(go, {}),
									/* @__PURE__ */ G($, {
										icon: /* @__PURE__ */ G(Qe, {}),
										disabled: !E.canUnmerge,
										onClick: () => e.onMergeCells("unmerge"),
										children: x("toolbar.merge_menu.unmerge")
									})
								]
							})
						]
					}),
					/* @__PURE__ */ G("div", { className: "ic-toolbar-divider" }),
					/* @__PURE__ */ G("div", {
						className: "ic-toolbar-button-group",
						children: /* @__PURE__ */ G(Z, {
							title: x("toolbar.add_link"),
							children: /* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(Te, {}),
								"aria-label": x("toolbar.add_link"),
								onClick: e.onOpenLinkDialog,
								disabled: !S
							})
						})
					}),
					/* @__PURE__ */ G("div", { className: "ic-toolbar-divider" }),
					/* @__PURE__ */ K("div", {
						className: "ic-toolbar-button-group",
						children: [/* @__PURE__ */ G(Z, {
							title: x("toolbar.selected_png"),
							children: /* @__PURE__ */ G(J, {
								icon: /* @__PURE__ */ G(xe, {}),
								"aria-label": x("toolbar.download_png"),
								onClick: () => e.onDownloadPNG(),
								disabled: !S
							})
						}), /* @__PURE__ */ G(Z, {
							title: x("toolbar.show_hide_grid_lines"),
							children: /* @__PURE__ */ G(J, {
								icon: e.showGridLines ? /* @__PURE__ */ G(ve, {}) : /* @__PURE__ */ G(ye, {}),
								"aria-label": x("toolbar.show_hide_grid_lines"),
								onClick: () => e.onToggleShowGridLines(!e.showGridLines),
								disabled: !S
							})
						})]
					}),
					/* @__PURE__ */ G(Zr, {
						color: e.fontColor,
						defaultColor: "",
						defaultSwatchColor: "var(--palette-sheet-default-text-color)",
						title: x("color_picker.default"),
						onChange: (t) => {
							e.onTextColorPicked(t), n(!1);
						},
						onClose: () => {
							n(!1);
						},
						anchorEl: p,
						open: t,
						theme: C
					}),
					/* @__PURE__ */ G(Zr, {
						color: e.fillColor,
						defaultColor: "",
						title: x("color_picker.default"),
						onChange: (t) => {
							t !== null && e.onFillColorPicked(t), i(!1);
						},
						onClose: () => {
							i(!1);
						},
						anchorEl: m,
						open: r,
						theme: C
					}),
					/* @__PURE__ */ G(xo, {
						onChange: (t) => {
							e.onBorderChanged(t);
						},
						onClose: () => {
							o(!1);
						},
						anchorEl: h,
						open: a,
						currentTheme: C
					})
				]
			}),
			s && /* @__PURE__ */ G("div", {
				className: "ic-toolbar-scroll-arrow ic-toolbar-scroll-arrow--left",
				onClick: M,
				children: /* @__PURE__ */ G(Z, {
					title: x("toolbar.scroll_left"),
					children: /* @__PURE__ */ G(ae, {})
				})
			}),
			l && /* @__PURE__ */ G("div", {
				className: "ic-toolbar-scroll-arrow ic-toolbar-scroll-arrow--right",
				onClick: N,
				children: /* @__PURE__ */ G(Z, {
					title: x("toolbar.scroll_right"),
					children: /* @__PURE__ */ G(oe, {})
				})
			})
		]
	});
}
//#endregion
//#region src/components/LinkDialog/util.ts
var Oo = [
	"http:",
	"https:",
	"ftp:",
	"ftps:",
	"file:",
	"mailto:"
];
function ko(e) {
	let t = e.trim();
	if (!t) return null;
	try {
		let e = new URL(t);
		return Oo.includes(e.protocol) ? t : null;
	} catch {
		return /^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(t) ? `https://${t}` : null;
	}
}
function Ao(e) {
	let t = e.split("?")[0];
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}
function jo(e) {
	try {
		return decodeURIComponent(e);
	} catch {
		return e;
	}
}
function Mo(e) {
	let t = e.startsWith("mailto:") ? e.slice(7) : e, n = t.indexOf("?");
	if (n === -1) return {
		address: t,
		subject: "",
		body: "",
		otherParams: ""
	};
	let r = t.slice(0, n), i = "", a = "", o = [];
	for (let e of t.slice(n + 1).split("&")) e.toLowerCase().startsWith("subject=") ? i = jo(e.slice(8)) : e.toLowerCase().startsWith("body=") ? a = jo(e.slice(5)) : e && o.push(e);
	return {
		address: r,
		subject: i,
		body: a,
		otherParams: o.join("&")
	};
}
function No(e, t, n, r) {
	let i = [];
	return t && i.push(`subject=${encodeURIComponent(t)}`), n && i.push(`body=${encodeURIComponent(n)}`), r && i.push(r), i.length === 0 ? `mailto:${e}` : `mailto:${e}?${i.join("&")}`;
}
var Po = /^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}(:\$?[A-Za-z]{1,3}\$?[0-9]{1,7})?$/, Fo = /^[A-Za-z_][A-Za-z0-9_.]*$/;
function Io(e) {
	let t = e.lastIndexOf("!");
	return t === -1 ? {
		sheetName: "",
		cellRef: e
	} : {
		sheetName: e.slice(0, t).replace(/^'(.*)'$/, "$1"),
		cellRef: e.slice(t + 1)
	};
}
//#endregion
//#region src/components/WorksheetCanvas/cellLinks.ts
var Lo = class {
	worksheet;
	options;
	links;
	constructor(e, t) {
		this.worksheet = e, this.options = t, this.links = /* @__PURE__ */ new Map(), this.attachHandlers();
	}
	setSheetLinks(e) {
		this.links.clear();
		for (let t of e) this.links.set(`${t.row}-${t.column}`, t);
	}
	getLink(e, t) {
		return this.links.get(`${e}-${t}`) || null;
	}
	attachHandlers() {
		let e = this.worksheet.canvas, t = e.parentElement ?? e;
		t.onpointermove = (t) => {
			if (t.target.closest?.(".ic-worksheet-link-tooltip")) return;
			let n = e.getBoundingClientRect(), r = this.getLinkCellAt(t.clientX - n.left, t.clientY - n.top);
			this.options.onLinkHover?.(r);
		}, t.onpointerleave = () => {
			this.options.onLinkHover?.(null);
		}, t.onpointerdown = (t) => {
			if (t.button !== 0 || !(t.ctrlKey || t.metaKey) || t.target.closest?.(".ic-worksheet-link-tooltip")) return;
			let n = e.getBoundingClientRect(), r = this.getLinkCellAt(t.clientX - n.left, t.clientY - n.top);
			r && (t.stopPropagation(), t.preventDefault(), this.options.onHideTooltip?.(), this.followLink(r.link));
		};
	}
	getLinkCellAt(e, t) {
		for (let n of this.worksheet.cells) if (n.link && e >= n.x && e <= n.x + n.width && t >= n.y && t <= n.y + n.height) {
			let { row: e, column: t, width: r, height: i, link: a } = n;
			return {
				row: e,
				column: t,
				x: n.x,
				y: n.y,
				width: r,
				height: i,
				link: a
			};
		}
		return null;
	}
	validateTooltip() {
		let e = this.options.tooltipCell;
		if (!e || !this.options.onHideTooltip) return;
		let t = this.worksheet.cells.find((t) => t.row === e.row && t.column === e.column);
		(!t?.link || t.x !== e.x || t.y !== e.y || t.width !== e.width || t.height !== e.height || JSON.stringify(t.link) !== JSON.stringify(e.link)) && this.options.onHideTooltip();
	}
	followLink(e) {
		if (e.type === "External") {
			try {
				if (!Oo.includes(new URL(e.target).protocol)) return;
			} catch {
				return;
			}
			window.open(e.target, "_blank", "noopener,noreferrer");
		} else this.followInternalLink(e.location);
	}
	followInternalLink(e) {
		let t = this.worksheet, n, r, i = e.lastIndexOf("!");
		if (i !== -1) n = e.slice(0, i), r = e.slice(i + 1);
		else {
			let i = t.model.getDefinedNameList().find((t) => t.name.toLowerCase() === e.toLowerCase());
			if (!i) return;
			let a = i.formula, o = a.lastIndexOf("!");
			if (o === -1) return;
			n = a.slice(0, o).replace(/^=/, ""), r = a.slice(o + 1);
		}
		n = n.replace(/^'(.*)'$/, "$1");
		let o = r.replace(/\$/g, "").split(":"), s = o[0].match(/^([A-Za-z]+)([0-9]+)$/);
		if (!s) return;
		let c = o.length === 2 && o[1].match(/^([A-Za-z]+)([0-9]+)$/) || s, l = t.model.getWorksheetsProperties().findIndex((e) => e.name === n);
		if (l === -1) return;
		let u, d, f, p;
		try {
			d = a(s[1].toUpperCase()), u = Number.parseInt(s[2], 10), p = a(c[1].toUpperCase()), f = Number.parseInt(c[2], 10);
		} catch {
			return;
		}
		if ([u, f] = [Math.min(u, f), Math.max(u, f)], [d, p] = [Math.min(d, p), Math.max(d, p)], u < 1 || f > 1048576 || d < 1 || p > 16384) return;
		t.model.setSelectedSheet(l), t.model.setSelectedCell(u, d), t.model.setSelectedRange(u, d, f, p);
		let { topLeftCell: m, bottomRightCell: h } = t.getVisibleCells();
		(u < m.row || u > h.row || d < m.column || d > h.column) && t.model.setTopLeftVisibleCell(u, d), t.refresh(), t.renderSheet();
	}
}, Ro = {
	ArrowUp: {
		paths: ["m5 12 7-7 7 7", "M12 19V5"],
		stroke: !0
	},
	ArrowRight: {
		paths: ["M5 12h14", "m12 5 7 7-7 7"],
		stroke: !0
	},
	ArrowDown: {
		paths: ["M12 5v14", "m19 12-7 7-7-7"],
		stroke: !0
	},
	ArrowAngleUp: {
		paths: ["M7 7h10v10", "M7 17 17 7"],
		stroke: !0
	},
	ArrowAngleDown: {
		paths: ["m7 7 10 10", "M17 7v10H7"],
		stroke: !0
	},
	TriangleUp: {
		paths: ["m18 15-6-6-6 6"],
		stroke: !0,
		strokeWidth: 2
	},
	TriangleDown: {
		paths: ["m6 9 6 6 6-6"],
		stroke: !0,
		strokeWidth: 2
	},
	TriangleUpFilled: {
		paths: ["M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"],
		fill: !0
	},
	TriangleDownFilled: {
		paths: ["M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"],
		fill: !0,
		flipY: !0
	},
	FlatRectangle: {
		paths: ["M5 12h14"],
		stroke: !0,
		strokeWidth: 3
	},
	Circle: {
		paths: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0"],
		fill: !0
	},
	Rhombus: {
		paths: ["M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41L13.7 2.71a2.41 2.41 0 0 0-3.41 0Z"],
		fill: !0
	},
	Flag: {
		paths: ["M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2a8 8 0 0 1 4 1 8 8 0 0 0 4 1 6 6 0 0 0 2.8-.7 1 1 0 0 1 1.2.15 1 1 0 0 1 0 .85V13a1 1 0 0 1-.6.9A6 6 0 0 1 16 14a8 8 0 0 1-4-1 8 8 0 0 0-4-1 6 6 0 0 0-4 1.4"],
		fill: !0,
		stroke: !0
	},
	Check: {
		paths: ["M20 6 9 17l-5-5"],
		stroke: !0,
		strokeWidth: 2
	},
	Cross: {
		paths: ["M18 6 6 18", "m6 6 12 12"],
		stroke: !0,
		strokeWidth: 2
	},
	Exclamation: {
		paths: [
			"M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0",
			"M12 8v4",
			"M12 16h.01"
		],
		stroke: !0
	},
	Heart: {
		paths: ["M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"],
		fill: !0
	},
	ThumbsUp: {
		paths: ["M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z", "M7 10v12"],
		stroke: !0
	},
	ThumbsDown: {
		paths: ["M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z", "M17 14V2"],
		stroke: !0
	},
	Star: {
		paths: ["M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"],
		stroke: !1
	}
}, zo = 3;
function Bo(e, t, n, r, i) {
	e.beginPath(), e.moveTo(t, n), e.lineTo(r, i), e.stroke();
}
function Vo(e, t, n, r, i, a, o, s) {
	switch (e.save(), e.strokeStyle = n, t) {
		case "thin":
			e.lineWidth = 1, Bo(e, r, i, a, o);
			break;
		case "medium":
			e.lineWidth = 2, Bo(e, r, i, a, o);
			break;
		case "thick":
			e.lineWidth = 3, Bo(e, r, i, a, o);
			break;
		case "double":
			e.lineWidth = 1, s ? (Bo(e, r - 1, i, r - 1, o), Bo(e, r + 1, i, r + 1, o)) : (Bo(e, r, i - 1, a, i - 1), Bo(e, r, i + 1, a, i + 1));
			break;
		case "dotted":
			e.lineWidth = 1, e.setLineDash([1, 2]), Bo(e, r, i, a, o), e.setLineDash([]);
			break;
		case "mediumdashed":
			e.lineWidth = 2, e.setLineDash([4, 2]), Bo(e, r, i, a, o), e.setLineDash([]);
			break;
		case "slantdashdot":
			e.lineWidth = 1, e.setLineDash([
				4,
				2,
				1,
				2
			]), Bo(e, r, i, a, o), e.setLineDash([]);
			break;
		case "mediumdashdot":
			e.lineWidth = 2, e.setLineDash([
				4,
				2,
				1,
				2
			]), Bo(e, r, i, a, o), e.setLineDash([]);
			break;
		case "mediumdashdotdot":
			e.lineWidth = 2, e.setLineDash([
				4,
				2,
				1,
				2,
				1,
				2
			]), Bo(e, r, i, a, o), e.setLineDash([]);
			break;
		case "dashed":
			e.lineWidth = 1, e.setLineDash([4, 2]), Bo(e, r, i, a, o), e.setLineDash([]);
			break;
		default: e.lineWidth = 1, Bo(e, r, i, a, o);
	}
	e.restore();
}
function Ho(e, t) {
	let n = parseInt(e.slice(1, 3), 16), r = parseInt(e.slice(3, 5), 16), i = parseInt(e.slice(5, 7), 16), a = Math.round(n + (255 - n) * t), o = Math.round(r + (255 - r) * t), s = Math.round(i + (255 - i) * t);
	return `#${a.toString(16).padStart(2, "0")}${o.toString(16).padStart(2, "0")}${s.toString(16).padStart(2, "0")}`;
}
function Uo(e, t, n, r, i, a, o) {
	let { value: s, axis_position: c, is_gradient: l } = a, u = o(a.positive_color), d = o(a.negative_color), f = Math.max(2, Math.round(i * .15)), p = n + f, m = i - 2 * f, h = t + Math.round(c * r);
	if (e.save(), s >= c) {
		let n = h, i = t + Math.round(s * r), a = Math.max(0, i - n);
		if (a > 0) {
			if (l && a > 1) {
				let t = e.createLinearGradient(n, 0, i, 0);
				t.addColorStop(0, Ho(u, .6)), t.addColorStop(1, u), e.fillStyle = t;
			} else e.fillStyle = u;
			e.fillRect(n, p, a, m);
		}
	} else {
		let n = t + Math.round(s * r), i = h, a = Math.max(0, i - n);
		if (a > 0) {
			if (l && a > 1) {
				let t = e.createLinearGradient(n, 0, i, 0);
				t.addColorStop(0, d), t.addColorStop(1, Ho(d, .6)), e.fillStyle = t;
			} else e.fillStyle = d;
			e.fillRect(n, p, a, m);
		}
	}
	e.restore();
}
function Wo(e, t, n, r, i, a) {
	let o = Ro[t];
	if (!o) return;
	let s = a / 24;
	e.save(), e.translate(r - a / 2, i - a / 2), e.scale(s, s), o.flipY && (e.translate(0, 24), e.scale(1, -1)), e.strokeStyle = n, e.fillStyle = n, e.lineWidth = (o.strokeWidth ?? 1.5) / s, e.lineCap = "round", e.lineJoin = "round";
	for (let t of o.paths) {
		let n = new Path2D(t);
		(o.fill ?? !o.stroke) && e.fill(n), o.stroke && e.stroke(n);
	}
	e.restore();
}
function Go(e, t, n, r, i, a, o) {
	e.save(), Wo(e, i.icon, o(i.color), t + zo + a / 2, n + r / 2, a), e.restore();
}
function Ko(e, t, n, r, i, a, o) {
	e.save();
	let s = o(i.color);
	for (let o = 0; o < i.count; o++) Wo(e, i.icon, s, t + zo + a / 2 + o * a, n + r / 2, a);
	e.restore();
}
//#endregion
//#region src/components/workbookState.ts
var qo = /* @__PURE__ */ function(e) {
	return e[e.rowsDown = 0] = "rowsDown", e[e.columnsRight = 1] = "columnsRight", e[e.rowsUp = 2] = "rowsUp", e[e.columnsLeft = 3] = "columnsLeft", e;
}({}), Jo = class {
	extendToArea;
	copyStyles;
	cell;
	cutRange;
	selecting;
	constructor() {
		this.extendToArea = null, this.copyStyles = null, this.cell = null, this.cutRange = null, this.selecting = !1;
	}
	isSelecting() {
		return this.selecting;
	}
	setSelecting(e) {
		this.selecting = e;
	}
	getExtendToArea() {
		return this.extendToArea;
	}
	clearExtendToArea() {
		this.extendToArea = null;
	}
	setExtendToArea(e) {
		this.extendToArea = e;
	}
	setCopyStyles(e) {
		this.copyStyles = e;
	}
	getCopyStyles() {
		return this.copyStyles;
	}
	setActiveRanges(e) {
		this.cell && (this.cell.activeRanges = e);
	}
	getActiveRanges() {
		return this.cell?.activeRanges || [];
	}
	getEditingCell() {
		return this.cell;
	}
	setEditingCell(e) {
		this.cell = e;
	}
	clearEditingCell() {
		this.cell = null;
	}
	isCellEditorActive() {
		return this.cell ? this.cell.focus === "cell" : !1;
	}
	isFormulaEditorActive() {
		return this.cell ? this.cell.focus === "formula-bar" : !1;
	}
	getEditingText() {
		let e = this.cell;
		if (e) {
			let t = e.referencedRange?.str || "";
			if (t === "") return e.text;
			{
				let n = e.cursorStart;
				return e.text.substring(0, n) + t + e.text.substring(n);
			}
		}
		return "";
	}
	setCutRange(e) {
		this.cutRange = e;
	}
	clearCutRange() {
		this.cutRange = null;
	}
	getCutRange() {
		return this.cutRange;
	}
};
//#endregion
//#region src/components/WorksheetCanvas/outlineHandle.ts
function Yo(e) {
	let t = e.canvas.parentElement;
	for (let e of t.querySelectorAll(".ironcalc-cell-handle")) e.remove();
	let n = document.createElement("div");
	n.className = "ironcalc-cell-handle", t.appendChild(n), e.cellOutlineHandle = n;
	let r = (t) => {
		let n = e.canvas.getBoundingClientRect(), r = t.clientX - n.x, i = t.clientY - n.y, a = e.getCellByCoordinates(r, i);
		if (!a) return;
		let { row: o, column: s } = a, { sheet: c, range: [l, u, d, f] } = e.model.getSelectedView(), p = (t, n) => rn(e.model.getMergedCells(c), {
			rowStart: l,
			rowEnd: d,
			columnStart: u,
			columnEnd: f
		}, t, n), m = (t) => {
			e.workbookState.setExtendToArea(t), e.renderSheet();
		}, h = () => {
			e.workbookState.getExtendToArea() && (e.workbookState.clearExtendToArea(), e.renderSheet());
		};
		if (o > d && (s <= f && s >= u || s < u && u - s < o - d || s > f && s - f < o - d)) {
			let e = p("rowsDown", o - d);
			if (e === 0) {
				h();
				return;
			}
			m({
				type: qo.rowsDown,
				rowStart: d + 1,
				rowEnd: d + e,
				columnStart: u,
				columnEnd: f
			});
		} else if (o < l && (s <= f && s >= u || s < u && u - s < l - o || s > f && s - f < l - o)) {
			let e = p("rowsUp", l - o);
			if (e === 0) {
				h();
				return;
			}
			m({
				type: qo.rowsUp,
				rowStart: l - e,
				rowEnd: l,
				columnStart: u,
				columnEnd: f
			});
		} else if (s > f && (o <= d && o >= l || o < l && l - o < s - f || o > d && o - d < s - f)) {
			let e = p("columnsRight", s - f);
			if (e === 0) {
				h();
				return;
			}
			m({
				type: qo.columnsRight,
				rowStart: l,
				rowEnd: d,
				columnStart: f + 1,
				columnEnd: f + e
			});
		} else if (s < u && (o <= d && o >= l || o < l && l - o < u - s || o > d && o - d < u - s)) {
			let e = p("columnsLeft", u - s);
			if (e === 0) {
				h();
				return;
			}
			m({
				type: qo.columnsLeft,
				rowStart: l,
				rowEnd: d,
				columnStart: u - e,
				columnEnd: u
			});
		}
	}, i = (t) => {
		document.removeEventListener("pointermove", r), document.removeEventListener("pointerup", i);
		let { sheet: n, range: a } = e.model.getSelectedView(), o = e.workbookState.getExtendToArea();
		if (!o) return;
		let s = Math.min(a[0], a[2]), c = Math.abs(a[2] - a[0]) + 1, l = Math.abs(a[3] - a[1]) + 1, u = Math.min(a[1], a[3]), d = {
			sheet: n,
			row: s,
			column: u,
			width: l,
			height: c
		};
		try {
			switch (o.type) {
				case qo.rowsDown:
					e.model.autoFillRows(d, o.rowEnd);
					break;
				case qo.rowsUp:
					e.model.autoFillRows(d, o.rowStart);
					break;
				case qo.columnsRight:
					e.model.autoFillColumns(d, o.columnEnd);
					break;
				case qo.columnsLeft: e.model.autoFillColumns(d, o.columnStart);
			}
		} catch (t) {
			e.onAutofillError?.(`${t}`), e.workbookState.clearExtendToArea(), e.renderSheet();
			return;
		}
		let f = Math.min(s, o.rowStart), p = Math.min(u, o.columnStart), m = Math.max(s + c - 1, o.rowEnd), h = Math.max(u + l - 1, o.columnEnd);
		e.model.setSelectedCell(f, p), e.model.setSelectedRange(f, p, m, h), e.workbookState.clearExtendToArea(), e.renderSheet();
	};
	return n.addEventListener("pointerdown", () => {
		document.addEventListener("pointermove", r), document.addEventListener("pointerup", i);
	}), n.addEventListener("dblclick", (t) => {
		t.stopPropagation(), t.preventDefault();
		let { sheet: n, range: r } = e.model.getSelectedView(), i = Math.min(r[0], r[2]), a = Math.max(r[0], r[2]), o = Math.min(r[1], r[3]), s = Math.max(r[1], r[3]), c = s - o + 1, l = a - i + 1, u = a, d = o - 1, f = d >= 1 && e.model.getFormattedCellValue(n, i, d) !== "", p = s + 1, m = p <= 16384 && e.model.getFormattedCellValue(n, i, p) !== "";
		d = f ? o - 1 : m ? p : o;
		for (let t = a + 1; t <= en && e.model.getFormattedCellValue(n, t, d) !== ""; t += 1) u = t;
		let h = a + 1, g = Array.from({ length: s - o + 1 }, (e, t) => o + t).every((t) => e.model.getFormattedCellValue(n, h, t) === "");
		for (let t = h; t <= u; t += 1) {
			let r = !1;
			for (let i = o; i <= s; i += 1) if (e.model.getFormattedCellValue(n, t, i) !== "") {
				r = !0;
				break;
			}
			if (g) {
				if (r) {
					u = t - 1;
					break;
				}
			} else if (!r) {
				u = t - 1;
				break;
			}
		}
		if (u = a + rn(e.model.getMergedCells(n), {
			rowStart: i,
			rowEnd: a,
			columnStart: o,
			columnEnd: s
		}, "rowsDown", u - a), u <= a) return;
		let _ = {
			sheet: n,
			row: i,
			column: o,
			width: c,
			height: l
		};
		try {
			e.model.autoFillRows(_, u);
		} catch (t) {
			e.onAutofillError?.(`${t}`);
			return;
		}
		e.model.setSelectedRange(i, o, u, s), e.renderSheet();
	}), n;
}
//#endregion
//#region src/components/WorksheetCanvas/util.ts
function Xo(e) {
	let t = e.replace(/^#/, "");
	return `rgba(${Number.parseInt(t.substring(0, 2), 16)}, ${Number.parseInt(t.substring(2, 4), 16)}, ${Number.parseInt(t.substring(4, 6), 16)}, 0.1)`;
}
function Zo(e, t, n, r) {
	let i = e.split("\n");
	if (!t) return i;
	let a = [];
	for (let e of i) {
		let t = e.split(" "), i = t[0];
		for (let e = 1; e < t.length; e += 1) {
			let o = t[e], s = `${i} ${o}`;
			n.measureText(s).width < r ? i = s : (a.push(i), i = o);
		}
		a.push(i);
	}
	return a;
}
function Qo(e, t) {
	return t.getPropertyValue(e).trim();
}
function $o(e) {
	let t = getComputedStyle(e);
	return {
		backgroundColor: Qo("--palette-common-white", t),
		filledCellTextColor: Ln["--palette-sheet-default-text-color"],
		commonWhite: Qo("--palette-common-white", t),
		gridColor: Qo("--palette-sheet-grid-color", t),
		cellFontFamily: Qo("--palette-sheet-default-cell-font-family", t),
		primaryMain: Qo("--palette-primary-main", t),
		headerTextColor: Qo("--palette-sheet-header-text-color", t),
		headerBackground: Qo("--palette-sheet-header-background", t),
		headerCornerBackground: Qo("--palette-sheet-header-corner-background", t),
		headerSelectedBackground: Qo("--palette-sheet-header-selected-background", t),
		headerBorderColor: Qo("--palette-sheet-header-border-color", t),
		outlineColor: Qo("--palette-sheet-outline-color", t),
		headerFont: Qo("--palette-sheet-header-font", t),
		gridSeparatorColor: Qo("--palette-sheet-grid-separator-color", t),
		defaultTextColor: Qo("--palette-sheet-default-text-color", t),
		headerSelectedColor: Qo("--palette-sheet-header-selected-color", t)
	};
}
//#endregion
//#region src/components/WorksheetCanvas/worksheetCanvas.ts
var es = window.devicePixelRatio || 1, ts = class {
	sheetWidth;
	sheetHeight;
	width;
	height;
	ctx;
	canvas;
	editor;
	areaOutline;
	cellArrayStructure;
	cellOutline;
	cellOutlineHandle;
	extendToOutline;
	workbookState;
	model;
	rowGuide;
	columnHeaders;
	columnGuide;
	onColumnWidthChanges;
	onRowHeightChanges;
	onAutofillError;
	refresh;
	cells;
	spills;
	mergedCells;
	mergeMap;
	renderedMergedStyles;
	renderedMergedTexts;
	paneIndex;
	paneClip;
	cellLinks;
	theme;
	constructor(e) {
		this.model = e.model, this.sheetWidth = 0, this.sheetHeight = 0, this.canvas = e.elements.canvas, this.width = e.width, this.height = e.height, this.ctx = this.setContext(), this.workbookState = e.workbookState, this.editor = e.elements.editor, this.refresh = e.refresh;
		let t = this.canvas.closest(".ic-root");
		if (!t) throw Error("WorksheetCanvas must be rendered within an .ic-root");
		this.theme = $o(t), this.cellOutline = e.elements.cellOutline, this.cellArrayStructure = e.elements.cellArrayStructure, this.areaOutline = e.elements.areaOutline, this.extendToOutline = e.elements.extendToOutline, this.rowGuide = e.elements.rowGuide, this.columnGuide = e.elements.columnGuide, this.columnHeaders = e.elements.columnHeaders, this.onColumnWidthChanges = e.onColumnWidthChanges, this.onRowHeightChanges = e.onRowHeightChanges, this.onAutofillError = e.onAutofillError, this.resetHeaders(), this.cellOutlineHandle = Yo(this), this.spills = /* @__PURE__ */ new Map(), this.cells = [], this.mergedCells = [], this.mergeMap = /* @__PURE__ */ new Map(), this.renderedMergedStyles = /* @__PURE__ */ new Set(), this.renderedMergedTexts = /* @__PURE__ */ new Set(), this.paneIndex = 0, this.paneClip = [
			0,
			0,
			0,
			0
		], this.cellLinks = new Lo(this, {
			onLinkHover: e.onLinkHover,
			onHideTooltip: e.onHideLinkTooltip,
			tooltipCell: e.linkTooltipCell
		});
	}
	followLink(e) {
		this.cellLinks.followLink(e);
	}
	setScrollPosition(e) {
		let { column: t } = this.getBoundedColumn(e.left), { row: n } = this.getBoundedRow(e.top);
		this.model.setTopLeftVisibleCell(n, t);
	}
	resetHeaders() {
		for (let e of this.columnHeaders.querySelectorAll(".column-resize-handle")) e.remove();
		for (let e of this.columnHeaders.querySelectorAll(".frozen-column-separator")) e.remove();
		for (let e of this.columnHeaders.children) e.classList.add("column-header");
	}
	setContext() {
		let { canvas: e, width: t, height: n } = this, r = e.getContext("2d");
		if (!r) throw Error("This browser does not support 2-dimensional canvas rendering contexts.");
		return e.width = t * es, e.height = n * es, e.style.width = `${t}px`, e.style.height = `${n}px`, r.scale(es, es), r;
	}
	setSize(e) {
		this.width = e.width, this.height = e.height, this.ctx = this.setContext();
	}
	getFrozenRowsHeight() {
		let e = this.model.getFrozenRowsCount(this.model.getSelectedSheet());
		if (e === 0) return 0;
		let t = 0;
		for (let n = 1; n <= e; n += 1) t += this.getRowHeight(this.model.getSelectedSheet(), n);
		return t + 3;
	}
	getFrozenColumnsWidth() {
		let e = this.model.getFrozenColumnsCount(this.model.getSelectedSheet());
		if (e === 0) return 0;
		let t = 0;
		for (let n = 1; n <= e; n += 1) t += this.getColumnWidth(this.model.getSelectedSheet(), n);
		return t + 3;
	}
	getPanes() {
		let e = this.getFrozenColumnsWidth(), t = this.getFrozenRowsHeight(), n = 30 + e, r = 28 + t, i = Math.max(0, e - 3), a = Math.max(0, t - 3);
		return [
			[
				30,
				28,
				i,
				a
			],
			[
				n,
				28,
				this.width - n,
				a
			],
			[
				30,
				r,
				i,
				this.height - r
			],
			[
				n,
				r,
				this.width - n,
				this.height - r
			]
		];
	}
	setPane(e, t) {
		this.paneIndex = e, this.paneClip = t[e];
	}
	clipToPane(e, t) {
		this.setPane(e, t);
		let [n, r, i, a] = this.paneClip;
		this.ctx.save(), this.ctx.beginPath(), this.ctx.rect(n, r, i, a), this.ctx.clip();
	}
	getVisibleCells() {
		let e = this.model.getSelectedView(), t = e.sheet, n = this.model.getFrozenRowsCount(t), r = this.model.getFrozenColumnsCount(t), i = Math.max(n + 1, e.top_row), a = i, o = Math.max(r + 1, e.left_column), s = o, c = this.getFrozenColumnsWidth(), l = 28 + this.getFrozenRowsHeight();
		for (let e = i; e <= en; e += 1) {
			let n = this.getRowHeight(t, e);
			if (l >= this.height - n || e === 1048576) {
				a = e;
				break;
			}
			l += n;
		}
		let u = 30 + c;
		for (let e = o; e <= $t; e += 1) {
			let n = this.getColumnWidth(t, e);
			if (u >= this.width - n || e === 16384) {
				s = e;
				break;
			}
			u += n;
		}
		return {
			topLeftCell: {
				row: i,
				column: o
			},
			bottomRightCell: {
				row: a,
				column: s
			}
		};
	}
	getBoundedRow(e) {
		let t = this.model.getSelectedSheet(), n = 0, r = 1 + this.model.getFrozenRowsCount(t);
		for (; r <= 1048576 && n <= e;) {
			let i = this.getRowHeight(t, r);
			if (n + i <= e) n += i;
			else break;
			r += 1;
		}
		return {
			row: r,
			top: n
		};
	}
	getBoundedColumn(e) {
		let t = 0, n = this.model.getSelectedSheet(), r = 1 + this.model.getFrozenColumnsCount(n);
		for (; t <= e && r <= 16384;) {
			let i = this.getColumnWidth(n, r);
			if (i + t <= e) t += i;
			else break;
			r += 1;
		}
		return {
			column: r,
			left: t
		};
	}
	getMinScrollLeft(e) {
		let t = 1 + this.model.getFrozenColumnsCount(this.model.getSelectedSheet()), n = 0;
		for (let r = t; r <= e; r += 1) {
			let e = this.getColumnWidth(this.model.getSelectedSheet(), r);
			n += e;
		}
		let r = n - this.width + this.getFrozenColumnsWidth() + 30, i = 0;
		for (let e = t; e <= $t; e += 1) {
			let t = this.getColumnWidth(this.model.getSelectedSheet(), e);
			if (i < r) i += t;
			else break;
		}
		return i;
	}
	getFontStyle(e) {
		let t = e.font?.sz || 13, n = `${t}px ${this.theme.cellFontFamily}`, r = e.fill.color ? this.theme.filledCellTextColor : this.theme.defaultTextColor;
		return e.font && (e.font.color && (r = this.model.resolveColor(e.font.color)), n = e.font.b ? `bold ${n}` : `400 ${n}`, e.font.i && (n = `italic ${n}`)), {
			font: n,
			color: r,
			fontSize: t
		};
	}
	getAlignment(e, t) {
		let n = e.alignment?.horizontal || "general", r = e.alignment?.vertical || "bottom";
		return n === "general" && (n = t === 1 ? "right" : t === 4 ? "center" : "left"), {
			horizontal: n,
			vertical: r
		};
	}
	computeCellTextLeftRight(e, t, n, r, i) {
		let a = this.model.getFrozenColumnsCount(e), o = this.model.getLastNonEmptyInRowBeforeColumn(e, t, r.column);
		if (o && o > a) {
			let r = this.getColumnWidth(e, o), [i, a] = this.getCoordinatesByCell(t, o);
			this.computeCellText(t, o, i, a, r, n);
		}
		let s = this.model.getFirstNonEmptyInRowAfterColumn(e, t, i.column);
		if (s) {
			let r = this.getColumnWidth(e, s), [i, a] = this.getCoordinatesByCell(t, s);
			this.computeCellText(t, s, i, a, r, n);
		}
	}
	updateMergedCells() {
		this.renderedMergedStyles = /* @__PURE__ */ new Set(), this.renderedMergedTexts = /* @__PURE__ */ new Set();
		let e = this.model.getSelectedSheet();
		this.mergedCells = this.model.getMergedCells(e), this.mergeMap = /* @__PURE__ */ new Map();
		for (let e of this.mergedCells) for (let t = e.row; t < e.row + e.height; t += 1) for (let n = e.column; n < e.column + e.width; n += 1) this.mergeMap.set(`${t}-${n}`, e);
	}
	getMergedRect(e) {
		let t = this.model.getSelectedSheet(), [n, r] = this.getCoordinatesByCell(e.row, e.column), i = 0;
		for (let n = e.column; n < e.column + e.width; n += 1) i += this.getColumnWidth(t, n);
		let a = 0;
		for (let n = e.row; n < e.row + e.height; n += 1) a += this.getRowHeight(t, n);
		return [
			n,
			r,
			i,
			a
		];
	}
	getMergedRectFrom(e, t, n, r, i) {
		let a = this.model.getSelectedSheet(), [, , o, s] = this.getMergedRect(e), c = r;
		for (let t = e.column; t < n; t += 1) c -= this.getColumnWidth(a, t);
		let l = i;
		for (let n = e.row; n < t; n += 1) l -= this.getRowHeight(a, n);
		return [
			c,
			l,
			o,
			s
		];
	}
	computeCellsText() {
		let { topLeftCell: e, bottomRightCell: t } = this.getVisibleCells(), n = this.model.getSelectedSheet();
		this.cells = [], this.cellLinks.setSheetLinks(this.model.getLinks(n));
		let r = this.model.getFrozenColumnsCount(n), i = this.model.getFrozenRowsCount(n), a = this.getPanes();
		this.setPane(0, a);
		let o = 30.5, s = 28.5;
		for (let e = 1; e <= i; e += 1) {
			let t = this.getRowHeight(n, e);
			o = 30.5;
			for (let i = 1; i <= r; i += 1) {
				let r = this.getColumnWidth(n, i);
				this.computeCellText(e, i, o, s, r, t), o += r;
			}
			s += t;
		}
		if (i === 0 && r !== 0) {
			o = 30.5;
			for (let e = 1; e <= r; e += 1) o += this.getColumnWidth(n, e);
		}
		i && (s += 3), r && (o += 3);
		let c = o, l = s;
		this.setPane(1, a), s = 28.5;
		for (let r = 1; r <= i; r += 1) {
			o = c;
			let i = this.getRowHeight(n, r);
			this.computeCellTextLeftRight(n, r, i, e, t);
			for (let { column: a } = e; a <= t.column; a += 1) {
				let e = this.getColumnWidth(n, a);
				this.computeCellText(r, a, o, s, e, i), o += e;
			}
			s += i;
		}
		this.setPane(2, a), s = l;
		for (let { row: i } = e; i <= t.row; i += 1) {
			o = 30;
			let e = this.getRowHeight(n, i);
			for (let t = 1; t <= r; t += 1) {
				let r = this.getColumnWidth(n, t);
				this.computeCellText(i, t, o, s, r, e), o += r;
			}
			s += e;
		}
		this.setPane(3, a), s = l;
		for (let { row: r } = e; r <= t.row; r += 1) {
			o = c;
			let i = this.getRowHeight(n, r);
			this.computeCellTextLeftRight(n, r, i, e, t);
			for (let { column: a } = e; a <= t.column; a += 1) {
				let e = this.getColumnWidth(n, a);
				this.computeCellText(r, a, o, s, e, i), o += e;
			}
			s += i;
		}
	}
	computeCellText(e, t, n, r, i, a) {
		let o = this.mergeMap.get(`${e}-${t}`);
		if (o) {
			let i = `${this.paneIndex}-${o.row}-${o.column}`;
			if (this.renderedMergedTexts.has(i)) return;
			this.renderedMergedTexts.add(i);
			let [a, s, c, l] = this.getMergedRectFrom(o, e, t, n, r);
			this.computeCellTextImpl(o.row, o.column, a, s, c, l, !0);
		} else this.computeCellTextImpl(e, t, n, r, i, a, !1);
	}
	computeCellTextImpl(e, t, n, r, i, a, o) {
		if (i <= 0 || a <= 0) return;
		let s = this.model.getSelectedSheet(), c = this.model.getCellStyle(s, e, t), l = c.style;
		if (c.icon && !c.icon.show_value || c.data_bar && !c.data_bar.show_value || c.rating && !c.rating.show_value) return;
		let { font: u, color: d, fontSize: f } = this.getFontStyle(l), p = this.cellLinks.getLink(e, t), m = this.model.getCellType(s, e, t), { horizontal: h, vertical: g } = this.getAlignment(l, m), _ = l.alignment?.wrap_text || !1, v = this.ctx;
		v.font = u, v.fillStyle = d;
		let y = this.model.getFormattedCellValue(s, e, t), b = f * 1.5, x = Zo(y, _, v, i - 4), S = x.length, C = 0, w = c.rating?.show_value ? c.rating.count * (l.font?.sz ? l.font.sz * 1.2 : 16) : 0, T = c.icon?.show_value ? 20 : w, E = n + T, D = n + i, O = {
			row: e,
			column: t,
			x: E,
			y: r,
			width: i - T,
			height: a,
			fontSize: f,
			textColor: d,
			font: u,
			underlined: l.font?.u || !1,
			strike: l.font?.strike || !1,
			lines: [],
			link: p,
			clip: this.paneClip
		};
		x.forEach((e, t) => {
			let o = v.measureText(e).width, s, c, l = 6.5;
			s = h === "right" ? i - 4 + n - o / 2 : h === "center" ? n + i / 2 : 4 + n + o / 2, c = g === "bottom" ? r + a - f / 2 - l + (t - S + 1) * b : g === "center" ? r + a / 2 + (t + (1 - S) / 2) * b : r + f / 2 + l + t * b, O.lines.push([
				e,
				s,
				c,
				o
			]), E = Math.min(E, s - o / 2), D = Math.max(D, s + o / 2), C = Math.max(C, s + o / 2 - n);
		});
		let k = n, A = n + i;
		if (!o && D > A && t < 16384 && (this.model.getFormattedCellValue(s, e, t + 1) === "" || this.getColumnWidth(s, t + 1) === 0)) {
			let n = t + 1, r = this.model.getFrozenColumnsCount(s);
			for (; A < D && !this.mergeMap.has(`${e}-${n}`) && (this.model.getFormattedCellValue(s, e, n) === "" || this.getColumnWidth(s, n) === 0) && n <= 16384 && (t < r && n <= r || t > r);) A += this.getColumnWidth(s, n), this.spills.set(`${e}-${n}`, 1), n += 1;
		}
		let j = this.model.getFrozenColumnsCount(s);
		if (!o && E < k && t > 1 && (this.model.getFormattedCellValue(s, e, t - 1) === "" || this.getColumnWidth(s, t - 1) === 0)) {
			let n = t - 1;
			for (; k > E && !this.mergeMap.has(`${e}-${n}`) && (this.model.getFormattedCellValue(s, e, n) === "" || this.getColumnWidth(s, n) === 0) && n >= 1 && (t <= j && n <= j || t > j);) k -= this.getColumnWidth(s, n), this.spills.set(`${e}-${n + 1}`, 1), --n;
		}
		if (j > 0) {
			let n = this.getCoordinatesByCell(e, j)[0] + this.getColumnWidth(s, j);
			t > j ? k = Math.max(k, n) : A = Math.min(A, n);
		}
		O.x = k, O.width = A - k, this.cells.push(O);
	}
	renderCellStyle(e, t, n, r, i, a) {
		let o = this.mergeMap.get(`${e}-${t}`);
		if (o) {
			let i = `${this.paneIndex}-${o.row}-${o.column}`;
			if (this.renderedMergedStyles.has(i)) {
				t === o.column && this.renderLeftBorder(e, t, n, r, a);
				return;
			}
			this.renderedMergedStyles.add(i);
			let [s, c, l, u] = this.getMergedRectFrom(o, e, t, n, r);
			this.renderCellStyleImpl(o.row, o.column, s, c, l, u, o);
		} else this.renderCellStyleImpl(e, t, n, r, i, a);
	}
	renderCellStyleImpl(e, t, n, r, i, a, o) {
		if (i <= 0 || a <= 0) return;
		let s = this.model.getSelectedSheet(), c = this.model.getCellStyle(s, e, t), l = c.style, u = this.theme.backgroundColor;
		l.fill.color && (u = this.model.resolveColor(l.fill.color));
		let d = this.ctx;
		if (d.fillStyle = u, d.fillRect(n + .5, r + .5, i - 1, a - 1), c.data_bar && Uo(d, n, r, i, a, c.data_bar, (e) => this.model.resolveColor(e)), c.icon) {
			let e = l.font?.sz ? l.font.sz * 1.2 : 16;
			Go(d, n, r, a, c.icon, e, (e) => this.model.resolveColor(e));
		}
		if (c.rating) {
			let e = l.font?.sz ? l.font.sz * 1.2 : 16;
			Ko(d, n, r, a, c.rating, e, (e) => this.model.resolveColor(e));
		}
		if (!o) {
			this.renderLeftBorder(e, t, n, r, a), this.renderTopBorder(e, t, n, r, i);
			return;
		}
		let f = r;
		for (let e = o.row; e < o.row + o.height; e += 1) {
			let t = this.getRowHeight(s, e);
			this.renderLeftBorder(e, o.column, n, f, t), f += t;
		}
		let p = n;
		for (let e = o.column; e < o.column + o.width; e += 1) {
			let t = this.getColumnWidth(s, e);
			this.renderTopBorder(o.row, e, p, r, t), p += t;
		}
	}
	getEffectiveFillColor(e, t) {
		let n = this.mergeMap.get(`${e}-${t}`), [r, i] = n ? [n.row, n.column] : [e, t], a = this.model.getCellStyle(this.model.getSelectedSheet(), r, i).style;
		return a.fill.color ? this.model.resolveColor(a.fill.color) : null;
	}
	renderLeftBorder(e, t, n, r, i) {
		let a = this.model.getSelectedSheet(), o = this.model.getCellStyle(a, e, t).style, s = this.model.getCellStyle(a, e, t - 1).style, c = this.ctx, l = o.border, u = this.getEffectiveFillColor(e, t), d = this.getEffectiveFillColor(e, t - 1);
		if (this.spills.get(`${e}-${t}`) !== 1) {
			let e = this.getCellGridColor(a, u), t = "thin";
			l.left ? (e = this.model.resolveColor(l.left.color) || this.theme.defaultTextColor, t = l.left.style) : s.border.right ? (e = this.model.resolveColor(s.border.right.color) || this.theme.defaultTextColor, t = s.border.right.style) : u ? e = u : d && (e = d), (n > 30.51 || l.left) && Vo(c, t, e, n, r, n, r + i, !0);
		} else {
			let e = this.theme.backgroundColor;
			u ? e = u : d && (e = d), e && Vo(c, "thin", e, n, r, n, r + i, !0);
		}
	}
	renderTopBorder(e, t, n, r, i) {
		let a = this.model.getSelectedSheet(), o = this.model.getCellStyle(a, e, t).style, s = this.model.getCellStyle(a, e - 1, t).style, c = o.border, l = this.getEffectiveFillColor(e, t), u = this.getEffectiveFillColor(e - 1, t), d = this.getCellGridColor(a, l), f = "thin";
		c.top ? (d = this.model.resolveColor(c.top.color) || this.theme.defaultTextColor, f = c.top.style) : s.border.bottom ? (d = this.model.resolveColor(s.border.bottom.color) || this.theme.defaultTextColor, f = s.border.bottom.style) : l ? d = l : u && (d = u), (r > 28.51 || c.top) && Vo(this.ctx, f, d, n, r, n + i, r, !1);
	}
	getCellGridColor(e, t) {
		return this.model.getShowGridLines(e) ? this.theme.gridColor : t ?? this.theme.backgroundColor;
	}
	renderCellText(e) {
		let { x: t, y: n, width: r, height: i, font: a, underlined: o, strike: s, fontSize: c, textColor: l, lines: u, clip: d } = e, f = this.ctx;
		f.font = a, f.fillStyle = l, f.save(), f.beginPath(), f.rect(t, n, r, i), f.clip(), f.beginPath(), f.rect(d[0], d[1], d[2], d[3]), f.clip(), u.forEach((e, t) => {
			let [n, r, i, a] = e;
			if (f.fillText(n, r, i), o) {
				let e = Math.floor(c / 2);
				f.beginPath(), f.strokeStyle = l, f.lineWidth = 1, f.moveTo(r - a / 2, i + e), f.lineTo(r + a / 2, i + e), f.stroke();
			}
			s && (f.beginPath(), f.strokeStyle = l, f.lineWidth = 1, f.moveTo(r - a / 2, i), f.lineTo(r + a / 2, i), f.stroke());
		}), f.restore();
	}
	addColumnResizeHandle(e, t, n) {
		let r = document.createElement("div");
		r.className = "column-resize-handle", r.style.left = `${e - 1}px`, r.style.height = "28px", this.columnHeaders.insertBefore(r, null);
		let i = 0, a = (t) => {
			n + t.pageX - i > 0 && (r.style.left = `${e + t.pageX - i - 1}px`, this.columnGuide.style.left = `${30 + e + t.pageX - i}px`);
		}, o = (e) => {
			r.style.opacity = "0", this.columnGuide.style.display = "none", document.removeEventListener("pointermove", a), document.removeEventListener("pointerup", o);
			let s = n + e.pageX - i;
			s !== n && this.onColumnWidthChanges(this.model.getSelectedSheet(), t, s);
		};
		o = o.bind(this), r.addEventListener("pointerdown", (t) => {
			r.style.opacity = "1", this.columnGuide.style.display = "block", this.columnGuide.style.left = `${30 + e}px`, i = t.pageX, document.addEventListener("pointermove", a), document.addEventListener("pointerup", o);
		}), r.addEventListener("dblclick", (e) => {
			let n = this.model.getSelectedSheet(), r = this.model.getRowsWithData(n, t), i = 0;
			for (let e of r) {
				let r = this.model.getFormattedCellValue(n, e, t);
				if (r === "") continue;
				let { style: a } = this.model.getCellStyle(n, e, t), o = `${a.font.sz}px ${this.theme.cellFontFamily}`;
				o = a.font.b ? `bold ${o}` : `400 ${o}`, this.ctx.font = o;
				let s = r.split("\n");
				for (let e of s) {
					let t = this.ctx.measureText(e).width;
					i = Math.max(i, t);
				}
			}
			i !== 0 && (this.model.setColumnsWidth(n, t, t, i + 8), this.refresh()), e.stopPropagation();
		});
	}
	addRowResizeHandle(e, t, n) {
		let r = document.createElement("div");
		r.className = "row-resize-handle", r.style.top = `${e - 1}px`, r.style.width = "30px";
		let i = this.model.getSelectedSheet();
		this.canvas.parentElement?.insertBefore(r, null);
		let a = 0, o = (t) => {
			n + t.pageY - a > 0 && (r.style.top = `${e + t.pageY - a - 1}px`, this.rowGuide.style.top = `${e + t.pageY - a}px`);
		}, s = (e) => {
			r.style.opacity = "0", this.rowGuide.style.display = "none", document.removeEventListener("pointermove", o), document.removeEventListener("pointerup", s);
			let c = n + e.pageY - a;
			c !== n && this.onRowHeightChanges(i, t, c);
		};
		s = s.bind(this), r.addEventListener("pointerdown", (t) => {
			t.stopPropagation(), r.style.opacity = "1", this.rowGuide.style.display = "block", this.rowGuide.style.top = `${e}px`, a = t.pageY, document.addEventListener("pointermove", o), document.addEventListener("pointerup", s);
		}), r.addEventListener("dblclick", (e) => {
			let n = this.model.getSelectedSheet(), r = this.model.getColumnsWithData(n, t), i = 0;
			for (let e of r) {
				let r = this.model.getFormattedCellValue(n, t, e);
				if (r === "") continue;
				let a = this.getColumnWidth(n, e), { style: o } = this.model.getCellStyle(n, t, e), s = o.font.sz, c = s * 1.5, l = `${s}px ${this.theme.cellFontFamily}`;
				l = o.font.b ? `bold ${l}` : `400 ${l}`, this.ctx.font = l;
				let u = (Zo(r, o.alignment?.wrap_text || !1, this.ctx, a).length - 1) * c + 8 + s;
				i = Math.max(i, u);
			}
			i !== 0 && (this.model.setRowsHeight(n, t, t, i), this.refresh()), e.stopPropagation();
		});
	}
	styleColumnHeader(e, t, n, r) {
		t.style.boxSizing = "border-box", t.style.width = `${e}px`, t.style.height = "28px", t.style.backgroundColor = n ? r ? this.theme.primaryMain : this.theme.headerSelectedBackground : this.theme.headerBackground, t.style.color = n ? r ? this.theme.commonWhite : this.theme.headerSelectedColor : this.theme.headerTextColor, t.style.fontWeight = "bold", t.style.borderLeft = `1px solid ${this.theme.headerBorderColor}`, t.style.borderTop = `1px solid ${this.theme.headerBorderColor}`, n ? (t.style.borderBottom = `1px solid ${this.theme.outlineColor}`, t.classList.add("selected")) : t.classList.remove("selected");
	}
	removeHandles() {
		let e = this.canvas.parentElement;
		if (e) for (let t of e.querySelectorAll(".row-resize-handle")) t.remove();
	}
	renderRowHeaders(e, t, n) {
		let { sheet: r, range: i } = this.model.getSelectedView(), a = i[0], o = i[2], s = i[1], c = i[3];
		a > o && ([a, o] = [o, a]), s > c && ([s, c] = [c, s]);
		let l = s === 1 && c === 16384, u = this.ctx, d = 28.5, f = e === 0 ? t.row : 1;
		for (let i = f; i <= n.row; i += 1) {
			let n = this.getRowHeight(r, i);
			if (n <= 0) continue;
			let s = i >= a && i <= o;
			u.fillStyle = this.theme.headerBorderColor, u.fillRect(0, d, 30, n), u.fillStyle = s ? l ? this.theme.primaryMain : this.theme.headerSelectedBackground : this.theme.headerBackground, u.fillRect(0, d + .5, 30, n - 1), s && (u.fillStyle = this.theme.outlineColor, u.fillRect(29, d, 1, n)), u.fillStyle = s ? l ? this.theme.commonWhite : this.theme.headerSelectedColor : this.theme.headerTextColor, u.font = this.theme.headerFont, u.fillText(`${i}`, 15, d + n / 2, 30), d += n, this.addRowResizeHandle(d, i, n), i === e && (d += 3, i = t.row - 1);
		}
	}
	renderColumnHeaders(e, t, n) {
		let { columnHeaders: r } = this, i = 0, { range: a } = this.model.getSelectedView(), o = a[0], s = a[2], c = a[1], l = a[3];
		c > l && ([c, l] = [l, c]), o > s && ([o, s] = [s, o]);
		let u = o === 1 && s === 1048576;
		for (let e of r.querySelectorAll(".column-header")) e.remove();
		for (let e of r.querySelectorAll(".column-resize-handle")) e.remove();
		for (let e of r.querySelectorAll(".frozen-column-separator")) e.remove();
		r.style.font = this.theme.headerFont, r.style.height = "28px", r.style.lineHeight = "28px", r.style.left = "30px";
		for (let t = 1; t <= e; t += 1) {
			let e = t >= c && t <= l;
			i += this.addColumnHeader(i, t, e, u);
		}
		if (e !== 0) {
			let e = document.createElement("div");
			e.className = "frozen-column-separator", e.style.width = "3px", e.style.height = "28px", e.style.display = "inline-block", e.style.backgroundColor = this.theme.gridSeparatorColor, this.columnHeaders.insertBefore(e, null), i += 3;
		}
		for (let e = t; e <= n; e += 1) {
			let t = e >= c && e <= l;
			i += this.addColumnHeader(i, e, t, u);
		}
		r.style.width = `${i}px`;
	}
	addColumnHeader(e, t, n, r) {
		let a = this.getColumnWidth(this.model.getSelectedSheet(), t);
		if (a <= 0) return 0;
		let o = document.createElement("div");
		return o.className = "column-header", o.textContent = i(t), this.columnHeaders.insertBefore(o, null), this.styleColumnHeader(a, o, n, r), this.addColumnResizeHandle(e + a, t, a), a;
	}
	getSheetDimensions() {
		let e = 30;
		for (let t = 1; t < $t + 1; t += 1) e += this.getColumnWidth(this.model.getSelectedSheet(), t);
		let t = 28;
		for (let e = 1; e < en + 1; e += 1) t += this.getRowHeight(this.model.getSelectedSheet(), e);
		return this.sheetWidth = Math.floor(e + this.getColumnWidth(this.model.getSelectedSheet(), $t)), this.sheetHeight = Math.floor(t + 2 * this.getRowHeight(this.model.getSelectedSheet(), en)), [this.sheetWidth, this.sheetHeight];
	}
	getClipCSS(e, t, n, r, i, a) {
		if (!i && !a) return "";
		let o = a ? this.getFrozenColumnsWidth() : 0, s = i ? this.getFrozenRowsHeight() : 0, c = 28 + s, l = 30 + o, u = l + this.width - 30 - o, d = c + this.height - 28 - s, f = t < c ? c - t : 0, p = e < l ? l - e : 0;
		return `rect(${f}px ${e + n > u ? u - e : n + 4}px ${t + r > d ? d - t : r + 4}px ${p}px)`;
	}
	getAreaDimensions(e, t, n, r) {
		let [i, a] = this.getCoordinatesByCell(e, t), [o, s] = this.getCoordinatesByCell(n, r);
		o += this.getColumnWidth(this.model.getSelectedSheet(), r), s += this.getRowHeight(this.model.getSelectedSheet(), n);
		let c = this.model.getFrozenRowsCount(this.model.getSelectedSheet()), l = this.model.getFrozenColumnsCount(this.model.getSelectedSheet());
		if (c !== 0 || l !== 0) {
			let [i, a] = this.getCoordinatesByCell(c, l);
			l > 0 && (i += this.getColumnWidth(this.model.getSelectedSheet(), l)), c > 0 && (a += this.getRowHeight(this.model.getSelectedSheet(), c)), e <= c && n > c && (s = Math.max(s, a)), t <= l && r > l && (o = Math.max(o, i));
		}
		return [Math.abs(o - i), Math.abs(s - a)];
	}
	getCoordinatesByCell(e, t) {
		let n = this.model.getSelectedSheet(), r = this.model.getFrozenColumnsCount(n), i = this.getFrozenColumnsWidth(), a = this.model.getFrozenRowsCount(n), o = this.getFrozenRowsHeight(), { topLeftCell: s } = this.getVisibleCells(), c, l;
		if (e <= a) {
			l = 28;
			for (let t = 1; t < e; t += 1) l += this.getRowHeight(n, t);
		} else if (e >= s.row) {
			l = 28 + o;
			for (let t = s.row; t < e; t += 1) l += this.getRowHeight(n, t);
		} else {
			l = 28 + o;
			for (let t = s.row; t > e; --t) l -= this.getRowHeight(n, t - 1);
		}
		if (t <= r) {
			c = 30;
			for (let e = 1; e < t; e += 1) c += this.getColumnWidth(n, e);
		} else if (t >= s.column) {
			c = 30 + i;
			for (let e = s.column; e < t; e += 1) c += this.getColumnWidth(n, e);
		} else {
			c = 30 + i;
			for (let e = s.column; e > t; --e) c -= this.getColumnWidth(n, e - 1);
		}
		return [Math.floor(c), Math.floor(l)];
	}
	getCellByCoordinates(e, t) {
		let n = this.model.getFrozenColumnsCount(this.model.getSelectedSheet()), r = this.getFrozenColumnsWidth(), i = this.model.getFrozenRowsCount(this.model.getSelectedSheet()), a = this.getFrozenRowsHeight(), o = 0, s = 30, { topLeftCell: c } = this.getVisibleCells();
		if (e < 30) for (o = c.column; s >= e;) {
			if (--o, o < 1) {
				o = 1;
				break;
			}
			s -= this.getColumnWidth(this.model.getSelectedSheet(), o);
		}
		else if (e < 30 + r) {
			for (; s <= e;) if (o += 1, s += this.getColumnWidth(this.model.getSelectedSheet(), o), o > n)
 /* istanbul ignore next */
			return null;
		} else for (s = 30 + r, o = c.column - 1; s <= e;) {
			if (o += 1, o > 16384) return null;
			s += this.getColumnWidth(this.model.getSelectedSheet(), o);
		}
		let l = 28, u = 0;
		if (t < 28) for (u = c.row; l >= t;) {
			if (--u, u < 1) {
				u = 1;
				break;
			}
			l -= this.getRowHeight(this.model.getSelectedSheet(), u);
		}
		else if (t < 28 + a) {
			for (; l <= t;) if (u += 1, l += this.getRowHeight(this.model.getSelectedSheet(), u), u > i)
 /* istanbul ignore next */
			return null;
		} else for (l = 28 + a, u = c.row - 1; l <= t;) {
			if (u += 1, u > 1048576) {
				u = en;
				break;
			}
			l += this.getRowHeight(this.model.getSelectedSheet(), u);
		}
		return u < 1 && (u = 1), o < 1 && (o = 1), {
			row: u,
			column: o
		};
	}
	drawExtendToArea() {
		let { extendToOutline: e } = this, t = this.workbookState.getExtendToArea();
		if (t === null) {
			e.style.visibility = "hidden";
			return;
		}
		e.style.visibility = "visible";
		let { rowStart: n, rowEnd: r, columnStart: i, columnEnd: a } = t;
		n > r && ([n, r] = [r, n]), i > a && ([i, a] = [a, i]);
		let [o, s] = this.getCoordinatesByCell(n, i), [c, l] = this.getAreaDimensions(n, i, r, a);
		e.style.border = `1px dashed ${this.theme.outlineColor}`, e.style.borderRadius = "3px", e.style.left = `${o}px`, e.style.top = `${s}px`, e.style.width = `${c - 1}px`, e.style.height = `${l - 1}px`;
	}
	getColumnWidth(e, t) {
		return Math.round(this.model.getColumnWidth(e, t));
	}
	getRowHeight(e, t) {
		return Math.round(this.model.getRowHeight(e, t));
	}
	drawCellEditor() {
		let e = this.workbookState.getEditingCell(), t = this.model.getSelectedSheet(), { editor: n } = this;
		if (!e || e.sheet !== t) {
			n.style.left = "-9999px", n.style.top = "-9999px";
			return;
		}
		let { row: r, column: i } = e, [a, o] = this.getCoordinatesByCell(r, i), s = e.editorWidth + -2, c = e.editorHeight + -2;
		n.style.left = `${a}px`, n.style.top = `${o}px`, n.style.width = `${s - 1}px`, n.style.height = `${c - 1}px`;
	}
	drawArrayStructure() {
		let { cellArrayStructure: e } = this;
		e.style.visibility = "hidden";
		let [t, n, r] = this.model.getSelectedCell(), i = this.model.getCellArrayStructure(t, n, r), a = null;
		if (i === "SingleCell") return;
		if ("DynamicAnchor" in i) {
			let [e, t] = i.DynamicAnchor;
			a = [
				n,
				r,
				e,
				t
			];
		} else if ("DynamicChild" in i) a = i.DynamicChild;
		else if ("ArrayAnchor" in i) {
			let [e, t] = i.ArrayAnchor;
			a = [
				n,
				r,
				e,
				t
			];
		} else if ("ArrayChild" in i) a = i.ArrayChild;
		else return;
		let [o, s] = this.getCoordinatesByCell(a[0], a[1]), [c, l] = this.getCoordinatesByCell(a[0] + a[3], a[1] + a[2]);
		Object.assign(e.style, {
			visibility: "visible",
			left: `${o}px`,
			top: `${s}px`,
			width: `${c - o}px`,
			height: `${l - s}px`
		});
	}
	drawCellOutline() {
		let { cellOutline: e, areaOutline: t, cellOutlineHandle: n } = this;
		this.workbookState.getEditingCell() ? (e.style.visibility = "hidden", n.style.visibility = "hidden") : (e.style.visibility = "visible", n.style.visibility = this.workbookState.isSelecting() ? "hidden" : "visible"), t.style.visibility = "visible";
		let [r, i, a] = this.model.getSelectedCell(), { topLeftCell: o } = this.getVisibleCells(), s = this.model.getFrozenRowsCount(r), c = this.model.getFrozenColumnsCount(r), [l, u] = this.getCoordinatesByCell(i, a), d = this.mergeMap.get(`${i}-${a}`), f, p, m = i, h = a;
		if (d) {
			m = d.row + d.height - 1, h = d.column + d.width - 1;
			let [e, t] = this.getAreaDimensions(d.row, d.column, m, h);
			f = e + -2, p = t + -2;
		} else f = this.getColumnWidth(r, a) + -2, p = this.getRowHeight(r, i) + -2;
		(i > s && m < o.row || a > c && h < o.column) && (e.style.visibility = "hidden"), e.style.borderBottom = m > s && m < o.row ? "none" : "", e.style.borderRight = h > c && h < o.column ? "none" : "";
		let g = i < o.row && i > s, _ = a < o.column && a > c;
		e.style.clip = this.getClipCSS(l - -1 - 2, u - -1 - 2, f + 1, p + 1, g, _), e.style.left = `${l - -1 - 2}px`, e.style.top = `${u - -1 - 2}px`, e.style.minWidth = "", e.style.minHeight = "", e.style.maxWidth = "", e.style.maxHeight = "", e.style.overflow = "hidden", e.style.width = `${f + 1}px`, e.style.height = `${p + 1}px`, e.style.background = "none", e.style.lineHeight = `${p - 4}px`;
		let { range: [v, y, b, x] } = this.model.getSelectedView();
		v > b && ([v, b] = [b, v]), y > x && ([y, x] = [x, y]);
		let S, C, w = d !== void 0 && v === d.row && y === d.column && b === d.row + d.height - 1 && x === d.column + d.width - 1;
		if (y === x && v === b || w) t.style.visibility = "hidden", [S, C] = this.getCoordinatesByCell(m, h), S += this.getColumnWidth(r, h), C += this.getRowHeight(r, m), (m > s && m < o.row || h > c && h < o.column) && (n.style.visibility = "hidden");
		else {
			let [e, r] = this.getCoordinatesByCell(v, y), [i, a] = this.getAreaDimensions(v, y, b, x);
			S = e + i, C = r + a;
			let l = this.workbookState.isSelecting(), u = +!!l;
			t.style.left = `${e - -1 - 1}px`, t.style.top = `${r - -1 - 1}px`, t.style.width = `${i + -2 + 1 + u}px`, t.style.height = `${a + -2 + 1 + u}px`;
			let d = v < o.row && v > s, f = y < o.column && y > c;
			t.style.clip = this.getClipCSS(e, r, i + -2, a + -2, d, f), t.style.border = l ? "none" : `1px solid ${this.theme.outlineColor}`, (b > s && b < o.row - 1 || x > c && x < o.column - 1) && (n.style.visibility = "hidden"), v <= s && b > s && b < o.row - 1 && (t.style.borderBottom = "None", n.style.visibility = "hidden"), y <= c && x > c && x < o.column - 1 && (t.style.borderRight = "None", n.style.visibility = "hidden");
		}
		let T = n.getBoundingClientRect(), E = T.width, D = T.height;
		n.style.left = `${S - E / 2 - 1}px`, n.style.top = `${C - D / 2 - 1}px`;
	}
	drawCutRange() {
		let e = this.workbookState.getCutRange() || null;
		if (!e) return;
		let t = this.model.getSelectedSheet();
		if (e.sheet !== t) return;
		let n = this.ctx;
		n.setLineDash([2, 2]);
		let [r, i] = this.getCoordinatesByCell(e.rowStart, e.columnStart), [a, o] = this.getCoordinatesByCell(e.rowEnd + 1, e.columnEnd + 1);
		n.strokeStyle = "red", n.lineWidth = 1, n.strokeRect(r, i, a - r, o - i), n.setLineDash([]);
	}
	drawActiveRanges(e, t) {
		let n = this.workbookState.getActiveRanges(), r = this.ctx;
		r.setLineDash([2, 2]);
		let i = this.workbookState.getEditingCell()?.referencedRange || null;
		i && (n = n.concat([{
			...i.range,
			color: xn(n.length)
		}]));
		let a = this.model.getSelectedSheet(), o = n.length;
		for (let i = 0; i < o; i += 1) {
			let o = n[i];
			if (o.sheet !== a) continue;
			let s = e.row - 1, c = t.row + 1, l = e.column - 1, u = t.column + 1;
			if (s <= o.rowEnd && o.rowStart <= c && l <= o.columnEnd && o.columnStart < u) {
				let e = {
					...o,
					rowStart: Math.max(s, o.rowStart),
					rowEnd: Math.min(c, o.rowEnd),
					columnStart: Math.max(l, o.columnStart),
					columnEnd: Math.min(u, o.columnEnd)
				}, [t, n] = this.getCoordinatesByCell(e.rowStart, e.columnStart), [i, a] = this.getCoordinatesByCell(e.rowEnd + 1, e.columnEnd + 1);
				r.strokeStyle = o.color, r.lineWidth = 1, r.strokeRect(t, n, i - t, a - n), r.fillStyle = Xo(o.color), r.fillRect(t, n, i - t, a - n);
			}
		}
		r.setLineDash([]);
	}
	drawHeaderSeparators(e, t) {
		let n = this.ctx;
		n.save(), n.strokeStyle = this.theme.headerBorderColor, n.lineWidth = 1, Bo(n, e, t, this.width, t), Bo(n, e, t, e, this.height), n.restore();
	}
	renderSheet() {
		let { canvas: e, ctx: t } = this, n = this.model.getSelectedSheet();
		t.lineWidth = 1, t.textAlign = "center", t.textBaseline = "middle", t.clearRect(0, 0, e.width, e.height), this.removeHandles(), this.updateMergedCells();
		let { topLeftCell: r, bottomRightCell: i } = this.getVisibleCells();
		this.computeCellsText(), this.cellLinks.validateTooltip();
		let a = this.model.getFrozenColumnsCount(n), o = this.model.getFrozenRowsCount(n), s = this.getPanes(), c = 30.5, l = 28.5;
		this.drawHeaderSeparators(c, l), this.clipToPane(0, s);
		for (let e = 1; e <= o; e += 1) {
			let t = this.getRowHeight(n, e);
			c = 30.5;
			for (let r = 1; r <= a; r += 1) {
				let i = this.getColumnWidth(n, r);
				this.renderCellStyle(e, r, c, l, i, t), c += i;
			}
			l += t;
		}
		if (t.restore(), o === 0 && a !== 0) {
			c = 30.5;
			for (let e = 1; e <= a; e += 1) c += this.getColumnWidth(n, e);
		}
		let u = 3 / 2;
		o && (t.fillStyle = this.theme.gridSeparatorColor, t.fillRect(0, Math.max(0, Math.round(l) - 1), this.width, 1), t.beginPath(), t.lineWidth = 3, t.strokeStyle = this.theme.gridSeparatorColor, t.moveTo(0, l + u), t.lineTo(this.width, l + u), l += 3, t.stroke(), t.lineWidth = 1), a && (t.fillStyle = this.theme.gridSeparatorColor, t.fillRect(Math.max(0, Math.round(c) - 2), 0, 2, this.height), t.beginPath(), t.lineWidth = 3, t.strokeStyle = this.theme.gridSeparatorColor, t.moveTo(c + u, 0), t.lineTo(c + u, this.height), c += 3, t.stroke(), t.lineWidth = 1);
		let d = c, f = l;
		this.clipToPane(1, s), l = 28.5;
		for (let e = 1; e <= o; e += 1) {
			c = d;
			let t = this.getRowHeight(n, e);
			for (let { column: a } = r; a <= i.column; a += 1) {
				let r = this.getColumnWidth(n, a);
				this.renderCellStyle(e, a, c, l, r, t), c += r;
			}
			l += t;
		}
		t.restore(), this.clipToPane(2, s), l = f;
		for (let { row: e } = r; e <= i.row; e += 1) {
			c = 30;
			let t = this.getRowHeight(n, e);
			for (let r = 1; r <= a; r += 1) {
				let i = this.getColumnWidth(n, r);
				this.renderCellStyle(e, r, c, l, i, t), c += i;
			}
			l += t;
		}
		t.restore(), this.clipToPane(3, s), l = f;
		for (let { row: e } = r; e <= i.row; e += 1) {
			c = d;
			let t = this.getRowHeight(n, e);
			for (let { column: a } = r; a <= i.column; a += 1) {
				let r = this.getColumnWidth(n, a);
				this.renderCellStyle(e, a, c, l, r, t), c += r;
			}
			l += t;
		}
		t.restore();
		for (let e of this.cells) this.renderCellText(e);
		this.renderColumnHeaders(a, r.column, i.column), this.renderRowHeaders(o, r, i), t.fillStyle = this.theme.headerCornerBackground, t.fillRect(0, 0, 30.5, 28.5), t.beginPath(), t.strokeStyle = this.theme.gridSeparatorColor, t.moveTo(0, .5), t.lineTo(c + 30, .5), t.stroke(), this.drawCellOutline(), this.drawArrayStructure(), this.drawCellEditor(), this.drawExtendToArea(), this.drawActiveRanges(r, i), this.drawCutRange();
	}
}, ns = (e) => {
	let { t } = D(), { open: n, onClose: r, anchorPosition: i, column: a, row: o, onInsertColumnLeft: s, onInsertColumnRight: c, onInsertRowAbove: l, onInsertRowBelow: u, onDeleteColumn: d, onDeleteRow: f, onCut: p, onCopy: m, onPaste: h } = e;
	return i ? /* @__PURE__ */ K(Oa, {
		open: n,
		onClose: r,
		anchorPosition: i,
		children: [
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ve, {}),
				onClick: p,
				children: t("context_menu.cell.cut")
			}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(V, {}),
				onClick: m,
				children: t("context_menu.cell.copy")
			}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(z, {}),
				onClick: h,
				children: t("context_menu.cell.paste")
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G(ka, {
				icon: /* @__PURE__ */ G(Ie, {}),
				submenu: /* @__PURE__ */ K(W, { children: [
					/* @__PURE__ */ G($, {
						onClick: s,
						children: t("context_menu.cell.insert_column_left")
					}),
					/* @__PURE__ */ G($, {
						onClick: c,
						children: t("context_menu.cell.insert_column_right")
					}),
					/* @__PURE__ */ G(go, {}),
					/* @__PURE__ */ G($, {
						onClick: l,
						children: t("context_menu.cell.insert_row_above")
					}),
					/* @__PURE__ */ G($, {
						onClick: u,
						children: t("context_menu.cell.insert_row_below")
					})
				] }),
				children: t("context_menu.cell.insert")
			}),
			/* @__PURE__ */ G(ka, {
				icon: /* @__PURE__ */ G(rt, {}),
				submenu: /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G($, {
					onClick: d,
					children: t("context_menu.cell.delete_column", { column: a })
				}), /* @__PURE__ */ G($, {
					onClick: f,
					children: t("context_menu.cell.delete_row", { row: o })
				})] }),
				children: t("context_menu.cell.delete")
			})
		]
	}) : null;
}, rs = (e) => {
	let { t } = D(), { open: n, onClose: r, anchorPosition: i, onInsertColumnsLeft: a, onInsertColumnsRight: o, onFreezeColumns: s, onUnfreezeColumns: c, onDeleteColumns: l, onMoveColumnsLeft: u, onMoveColumnsRight: d, onSetColumnWidth: f, onHideColumns: p, onShowHiddenColumns: m, range: h, frozenColumnsCount: g, hiddenColumnsCount: _ } = e, { columnStart: v, columnEnd: y, columnCount: b } = h;
	return i ? /* @__PURE__ */ K(Oa, {
		open: n,
		onClose: r,
		anchorPosition: i,
		children: [
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ie, {}),
				onClick: a,
				children: t("context_menu.column_header.insert_columns_before", { count: b })
			}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ie, {}),
				onClick: o,
				children: t("context_menu.column_header.insert_columns_after", { count: b })
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(P, {}),
				onClick: u,
				children: t("context_menu.column_header.move_columns_left")
			}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(F, {}),
				onClick: d,
				children: t("context_menu.column_header.move_columns_right")
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(ke, {}),
				onClick: f,
				children: t("context_menu.column_header.set_column_width")
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(he, {}),
				onClick: p,
				children: b === 1 ? t("context_menu.column_header.hide_column", { column: v }) : t("context_menu.column_header.hide_columns", {
					columnStart: v,
					columnEnd: y
				})
			}),
			_ > 0 && /* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(me, {}),
				onClick: m,
				children: t("context_menu.column_header.show_hidden_columns")
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ke, {}),
				onClick: s,
				children: t("context_menu.column_header.freeze_columns", { column: v })
			}),
			g > 0 && /* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ke, {}),
				onClick: c,
				children: t("context_menu.column_header.unfreeze_columns")
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(rt, {}),
				destructive: !0,
				onClick: l,
				children: b === 1 ? t("context_menu.column_header.delete_column", { column: v }) : t("context_menu.column_header.delete_columns", {
					columnStart: v,
					columnEnd: y
				})
			})
		]
	}) : null;
}, is = (e) => {
	let { t } = D(), { open: n, onClose: r, anchorPosition: i, onInsertRowsAbove: a, onInsertRowsBelow: o, onFreezeRows: s, onUnfreezeRows: c, onDeleteRows: l, onMoveRowsUp: u, onMoveRowsDown: d, onSetRowHeight: f, onHideRows: p, onShowHiddenRows: m, range: h, frozenRowsCount: g } = e, { rowStart: _, rowEnd: v } = h, y = v - _ + 1;
	return i ? /* @__PURE__ */ K(Oa, {
		open: n,
		onClose: r,
		anchorPosition: i,
		children: [
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ie, {}),
				onClick: a,
				children: t("context_menu.row_header.insert_rows_above", { count: y })
			}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ie, {}),
				onClick: o,
				children: t("context_menu.row_header.insert_rows_below", { count: y })
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(I, {}),
				onClick: u,
				children: t("context_menu.row_header.move_rows_up")
			}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(M, {}),
				onClick: d,
				children: t("context_menu.row_header.move_rows_down")
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ae, {}),
				onClick: f,
				children: t("context_menu.row_header.set_row_height")
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(he, {}),
				onClick: p,
				children: y === 1 ? t("context_menu.row_header.hide_row", { row: _ }) : t("context_menu.row_header.hide_rows", {
					rowStart: _,
					rowEnd: v
				})
			}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(me, {}),
				onClick: m,
				children: t("context_menu.row_header.show_hidden_rows")
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ke, {}),
				onClick: s,
				children: t("context_menu.row_header.freeze_rows", { row: _ })
			}),
			g > 0 && /* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(Ke, {}),
				onClick: c,
				children: t("context_menu.row_header.unfreeze_rows")
			}),
			/* @__PURE__ */ G(go, {}),
			/* @__PURE__ */ G($, {
				icon: /* @__PURE__ */ G(rt, {}),
				destructive: !0,
				onClick: l,
				children: y === 1 ? t("context_menu.row_header.delete_row", { row: _ }) : t("context_menu.row_header.delete_rows", {
					rowStart: _,
					rowEnd: v
				})
			})
		]
	}) : null;
};
//#endregion
//#region src/components/Worksheet/LinkTooltip.tsx
function as(e) {
	if (e.type === "Internal") return e.location;
	let t = e.target;
	try {
		let e = new URL(t);
		if (e.protocol === "http:" || e.protocol === "https:") return e.hostname.replace(/^www\./, "");
		if (e.protocol === "mailto:") return e.pathname;
	} catch {}
	return t;
}
var os = (e) => {
	let { cell: t, onFollow: n, onEdit: r, onDelete: i, onHide: a } = e, { t: o } = D(), s = w(null), [c, l] = T(null);
	S(() => {
		let e = s.current?.offsetHeight || 26;
		l((t) => t === e ? t : e);
	});
	let u = t.link, d = t.y - (c ?? 26) + 1;
	d < 28 && (d = t.y + t.height - 1);
	let f = Math.max(32, t.x);
	return /* @__PURE__ */ K("div", {
		ref: s,
		className: "ic-worksheet-link-tooltip",
		style: {
			left: f,
			top: d,
			visibility: c === null ? "hidden" : "visible"
		},
		onPointerEnter: e.onPointerEnter,
		onPointerLeave: e.onPointerLeave,
		onPointerDown: (e) => e.stopPropagation(),
		children: [/* @__PURE__ */ K("div", {
			className: "ic-worksheet-link-tooltip-row",
			children: [
				/* @__PURE__ */ G("span", {
					className: "ic-worksheet-link-tooltip-icon",
					children: /* @__PURE__ */ G(ge, {})
				}),
				/* @__PURE__ */ G("button", {
					type: "button",
					className: "ic-worksheet-link-tooltip-label",
					onClick: () => {
						a(), n(u);
					},
					children: as(u)
				}),
				/* @__PURE__ */ K("div", {
					className: "ic-worksheet-link-tooltip-actions",
					children: [
						/* @__PURE__ */ G("button", {
							type: "button",
							className: "ic-worksheet-link-tooltip-button",
							title: o("link_tooltip.copy"),
							"aria-label": o("link_tooltip.copy"),
							onClick: () => {
								let e = u.type === "External" ? u.target : u.location;
								navigator.clipboard?.writeText(e).catch(() => {});
							},
							children: /* @__PURE__ */ G(V, {})
						}),
						r && !u.dynamic && /* @__PURE__ */ G("button", {
							type: "button",
							className: "ic-worksheet-link-tooltip-button",
							title: o("link_tooltip.edit"),
							"aria-label": o("link_tooltip.edit"),
							onClick: () => {
								a(), r(t.row, t.column);
							},
							children: /* @__PURE__ */ G(Pe, {})
						}),
						i && !u.dynamic && /* @__PURE__ */ G("button", {
							type: "button",
							className: "ic-worksheet-link-tooltip-button",
							title: o("link_tooltip.break"),
							"aria-label": o("link_tooltip.break"),
							onClick: () => {
								a(), i(t.row, t.column);
							},
							children: /* @__PURE__ */ G(Ee, {})
						})
					]
				})
			]
		}), u.tooltip ? /* @__PURE__ */ G("div", {
			className: "ic-worksheet-link-tooltip-text",
			children: u.tooltip
		}) : null]
	});
}, ss = (e) => {
	let t = w(!1), n = w(!1), r = w(!1), i = w(null), a = w(!1), o = w(null), s = _((s) => {
		if (s.pointerType !== "mouse" || !(t.current || n.current || r.current || a.current)) return;
		let { canvasElement: c, model: l, worksheetCanvas: u, refresh: d } = e, f = c.current, p = u.current;
		if (!p || !f) return;
		let m = f.getBoundingClientRect(), h = s.clientX - m.x, g = s.clientY - m.y;
		if (r.current) {
			if (s.preventDefault(), i.current === null) return;
			let e = null;
			if (h >= 0 && h < 30 && g >= 28) {
				let t = p.getCellByCoordinates(30, g);
				t && (e = t.row);
			} else if (h >= 30 && g >= 28) {
				let t = p.getCellByCoordinates(h, g);
				t && (e = t.row);
			}
			if (e !== null) {
				let t = i.current;
				l.setSelectedCell(Math.min(t, e), 1), l.setSelectedRange(Math.min(t, e), 1, Math.max(t, e), $t), d();
			}
			return;
		}
		if (a.current) {
			if (s.preventDefault(), o.current === null) return;
			let e = null;
			if (h >= 30 && g >= 0 && g < 28) {
				let t = p.getCellByCoordinates(h, 28);
				t && (e = t.column);
			} else if (h >= 30 && g >= 28) {
				let t = p.getCellByCoordinates(h, g);
				t && (e = t.column);
			}
			if (e !== null) {
				let t = o.current;
				l.setSelectedCell(1, Math.min(t, e)), l.setSelectedRange(1, Math.min(t, e), en, Math.max(t, e)), d();
			}
			return;
		}
		let _ = p.getCellByCoordinates(h, g);
		if (_) {
			if (t.current) e.onAreaSelecting(_);
			else if (n.current) {
				let { workbookState: t } = e, n = t.getEditingCell();
				if (!n?.referencedRange) return;
				let { anchorRow: r, anchorColumn: i } = n.referencedRange, a = n.referencedRange.range;
				a.rowStart = r, a.columnStart = i, a.rowEnd = _.row, a.columnEnd = _.column, Object.assign(a, nn(l.getMergedCells(a.sheet), a));
				let o = l.getWorksheetsProperties().map((e) => e.name);
				n.referencedRange.str = dn(a, n.sheet, o[a.sheet]), t.setEditingCell(n), d();
			}
		}
	}, [e]), c = _((s) => {
		if (t.current) {
			let { worksheetElement: n } = e;
			t.current = !1, n.current?.releasePointerCapture(s.pointerId), e.onAreaSelected();
		} else if (n.current) {
			let { worksheetElement: t } = e;
			n.current = !1, t.current?.releasePointerCapture(s.pointerId);
		} else if (r.current) {
			let { worksheetElement: t } = e;
			r.current = !1, i.current = null, t.current?.releasePointerCapture(s.pointerId);
		} else if (a.current) {
			let { worksheetElement: t } = e;
			a.current = !1, o.current = null, t.current?.releasePointerCapture(s.pointerId);
		}
	}, [e]);
	return {
		onPointerDown: _((s) => {
			let c = s.target;
			if (c.className === "column-resize-handle" || c.className.includes("ironcalc-cell-handle") || s.button === 2) return;
			let l = s.clientX, u = s.clientY, { canvasElement: d, model: f, refresh: p, worksheetElement: m, worksheetCanvas: h, workbookState: g, onRowSelected: _, onColumnSelected: v, onAllSheetSelected: y } = e, b = h.current, x = d.current, S = m.current;
			if (!x || !b || !S) return;
			let C = x.getBoundingClientRect();
			if (l -= C.x, u -= C.y, l > C.width || l < 30 || u < 28 || u > C.height) {
				if (l < 30 && u < 28) y();
				else if (l > 0 && l < 30 && u > 28 && u < C.height) {
					let e = b.getCellByCoordinates(30, u);
					e && (s.shiftKey ? _(e.row, !0) : (s.preventDefault(), i.current = e.row, r.current = !0, S.setPointerCapture(s.pointerId), _(e.row, !1)));
				} else if (l > 30 && l < C.width && u > 0 && u < 28) {
					let e = b.getCellByCoordinates(l, 28);
					e && (s.shiftKey ? v(e.column, !0) : (s.preventDefault(), o.current = e.column, a.current = !0, S.setPointerCapture(s.pointerId), v(e.column, !1)));
				}
				return;
			}
			let w = g.getEditingCell(), T = b.getCellByCoordinates(l, u);
			if (T) {
				if (w) {
					if (f.getSelectedSheet() === w.sheet && T.row === w.row && T.column === w.column) return;
					let e = w.text;
					if (bn(f, e, w.cursorEnd)) {
						let e = f.getSelectedSheet(), t = tn(f.getMergedCells(e), T.row, T.column), r = t ? t.row : T.row, i = t ? t.column : T.column, a = {
							sheet: e,
							rowStart: r,
							rowEnd: r,
							columnStart: i,
							columnEnd: i
						}, o = f.getWorksheetsProperties().map((e) => e.name);
						w.referencedRange = {
							range: a,
							str: dn(a, w.sheet, o[a.sheet]),
							anchorRow: a.rowStart,
							anchorColumn: a.columnStart
						}, g.setEditingCell(w), s.stopPropagation(), s.preventDefault(), n.current = !0, S.setPointerCapture(s.pointerId), p();
						return;
					}
					f.setUserInput(w.sheet, w.row, w.column, g.getEditingText()), g.clearEditingCell();
				}
				s.shiftKey ? (e.onAreaSelecting(T), e.onAreaSelected()) : (e.onCellSelected(T, s), t.current = !0, S.setPointerCapture(s.pointerId));
			}
		}, [e]),
		onPointerMove: s,
		onPointerUp: c
	};
};
//#endregion
//#region src/components/Worksheet/Worksheet.tsx
function cs() {
	let [e, t] = T([0, 0]);
	return S(() => {
		function e() {
			t([window.innerWidth, window.innerHeight]);
		}
		return window.addEventListener("resize", e), e(), () => window.removeEventListener("resize", e);
	}, []), e;
}
var ls = g((e, t) => {
	let n = w(null), r = w(null), a = w(null), o = w(null), s = w(null), c = w(null), l = w(null), u = w(null), d = w(null), f = w(null), p = w(null), m = w(null), h = w(null), [g, _] = T(!1), [v, b] = T(!1), [S, C] = T(!1), [E, O] = T(null), [k, A] = T(null), [j, M] = T(!1), [N, ee] = T(""), [P, F] = T(null), [I, te] = T(!1), [ne, re] = T(""), ie = w(!1), L = w(null), [R, ae] = T(null), oe = w(null), se = () => {
		oe.current !== null && (clearTimeout(oe.current), oe.current = null);
	}, ce = () => {
		se(), ae(null);
	}, le = () => {
		oe.current === null && (oe.current = setTimeout(() => {
			oe.current = null, ae(null);
		}, 300));
	}, { model: z, workbookState: B, refresh: V, canEdit: ue, onCut: de, onCopy: fe, onPaste: pe } = e, { t: H } = D(), [me, he] = cs();
	x(t, () => ({ getCanvas: () => h.current })), y(() => {
		let e = n.current, t = f.current, i = p.current, g = m.current, _ = r.current, v = c.current, y = l.current, b = u.current, x = d.current, S = o.current;
		if (!e || !t || !i || !g || !_ || !v || !y || !x || !a.current || !S || !b || !e.closest(".ic-root")) return;
		z.setWindowWidth(me - 37), z.setWindowHeight(he - 190);
		let C = new ts({
			width: _.clientWidth,
			height: _.clientHeight,
			model: z,
			workbookState: B,
			elements: {
				canvas: e,
				columnGuide: t,
				rowGuide: i,
				columnHeaders: g,
				cellOutline: v,
				cellArrayStructure: b,
				areaOutline: y,
				extendToOutline: x,
				editor: S
			},
			onColumnWidthChanges(e, t, n) {
				if (n < 0) return;
				let { range: r } = z.getSelectedView(), i = t, a = t, o = r[0] === 1 && r[2] === 1048576, s = r[1] === 1 && r[3] === 16384;
				o && t >= r[1] && t <= r[3] && !s && (i = Math.min(r[1], t, r[3]), a = Math.max(r[1], t, r[3])), z.setColumnsWidth(e, i, a, n), h.current?.renderSheet();
			},
			onLinkHover: (e) => {
				e ? (se(), ae((t) => t && t.row === e.row && t.column === e.column ? t : e)) : R !== null && le();
			},
			onHideLinkTooltip: ce,
			onAutofillError: (e) => {
				(e.includes("merged cell") || e.includes("array formula")) && F(e);
			},
			linkTooltipCell: R,
			onRowHeightChanges(e, t, n) {
				if (n < 0) return;
				let { range: r } = z.getSelectedView(), i = t, a = t, o = r[0] === 1 && r[2] === 1048576;
				r[1] === 1 && r[3] === 16384 && t >= r[0] && t <= r[2] && !o && (i = Math.min(r[0], t, r[2]), a = Math.max(r[0], t, r[2])), z.setRowsHeight(e, i, a, n), h.current?.renderSheet();
			},
			refresh: V
		}), w = z.getScrollX(), T = z.getScrollY(), [E, D] = [w + 1e5, T + 5e5];
		s.current && (s.current.style.height = `${D}px`, s.current.style.width = `${E}px`);
		let O = L.current;
		if (!O || O.x !== w || O.y !== T) {
			let e = a.current.scrollLeft, t = a.current.scrollTop;
			a.current.scrollLeft = w, a.current.scrollTop = T, (a.current.scrollLeft !== e || a.current.scrollTop !== t) && (ie.current = !0), L.current = {
				x: w,
				y: T
			};
		}
		C.renderSheet(), h.current = C;
	});
	let { onPointerMove: U, onPointerDown: ge, onPointerUp: _e } = ss({
		model: z,
		workbookState: B,
		refresh: V,
		onColumnSelected: (e, t) => {
			let n = e, r = e;
			if (t) {
				let { range: t } = z.getSelectedView();
				n = Math.min(t[1], e, t[3]), r = Math.max(t[3], e, t[1]);
			}
			z.setSelectedCell(1, n), z.setSelectedRange(1, n, en, r), V();
		},
		onRowSelected: (e, t) => {
			let n = e, r = e;
			if (t) {
				let { range: t } = z.getSelectedView();
				n = Math.min(t[0], e, t[2]), r = Math.max(t[2], e, t[0]);
			}
			z.setSelectedCell(n, 1), z.setSelectedRange(n, 1, r, $t), V();
		},
		onAllSheetSelected: () => {
			z.setSelectedCell(1, 1), z.setSelectedRange(1, 1, en, $t), V();
		},
		onCellSelected: (e, t) => {
			t.preventDefault(), t.stopPropagation(), z.setSelectedCell(e.row, e.column), V();
		},
		onAreaSelecting: (e) => {
			let t = h.current;
			if (!t) return;
			B.setSelecting(!0);
			let { row: n, column: r } = e;
			z.onAreaSelecting(n, r), t.renderSheet(), V();
		},
		onAreaSelected: () => {
			B.setSelecting(!1);
			let e = B.getCopyStyles();
			if (e?.length) {
				z.onPasteStyles(e);
				let t = h.current;
				if (!t) return;
				t.renderSheet();
			}
			B.setCopyStyles(null), r.current && (r.current.style.cursor = "auto"), V();
		},
		canvasElement: n,
		worksheetElement: r,
		worksheetCanvas: h
	});
	return /* @__PURE__ */ K("div", {
		ref: a,
		onScroll: () => {
			if (!a.current || !h.current) return;
			if (ie.current) {
				ie.current = !1;
				return;
			}
			let e = a.current.scrollLeft, t = a.current.scrollTop;
			h.current.setScrollPosition({
				left: e,
				top: t
			}), h.current.renderSheet(), L.current = {
				x: z.getScrollX(),
				y: z.getScrollY()
			};
		},
		className: "ic-worksheet-wrapper scroll",
		children: [
			/* @__PURE__ */ G("div", {
				className: "ic-worksheet-spacer",
				ref: s
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-worksheet-sheet-container",
				ref: r,
				onPointerDown: ge,
				onPointerMove: U,
				onPointerUp: _e,
				onContextMenu: (e) => {
					if (e.preventDefault(), e.stopPropagation(), !ue) return;
					O({
						top: e.clientY,
						left: e.clientX
					});
					let t = n.current;
					if (t) {
						let n = t.getBoundingClientRect(), r = e.clientX - n.x, i = e.clientY - n.y;
						if (r > 30 && r < n.width && i > 0 && i < 28) {
							let e = z.getSelectedView(), t = e.range[0], n = e.range[1], i = e.range[2], a = e.range[3], o = h.current?.getCellByCoordinates(r, 28)?.column ?? e.column;
							if ((t !== 1 || i !== 1048576) && (z.setSelectedCell(1, o), z.setSelectedRange(1, o, en, o), V()), !(n <= o && o <= a)) {
								let t = h.current?.getCellByCoordinates(r, 28)?.column ?? e.column;
								z.setSelectedCell(1, t), z.setSelectedRange(1, t, en, t), V();
							}
							b(!0);
							return;
						}
						if (r > 0 && r < 30 && i > 28 && i < n.height) {
							let e = z.getSelectedView(), t = e.range[0], n = e.range[1], r = e.range[2], a = e.range[3], o = h.current?.getCellByCoordinates(30, i)?.row ?? e.row;
							if ((n !== 1 || a !== 16384) && (z.setSelectedCell(o, 1), z.setSelectedRange(o, 1, o, $t), V()), !(t <= o && o <= r)) {
								let t = h.current?.getCellByCoordinates(30, i)?.row ?? e.row;
								z.setSelectedCell(t, 1), z.setSelectedRange(t, 1, t, $t), V();
							}
							C(!0);
							return;
						}
						let a = h.current?.getCellByCoordinates(r, i);
						if (a) {
							let { range: e } = z.getSelectedView(), [t, n, r, i] = e;
							t <= a.row && a.row <= r && n <= a.column && a.column <= i || (z.setSelectedCell(a.row, a.column), V());
						}
					}
					_(!0);
				},
				onDoubleClick: (t) => {
					if (!ue) return;
					let { sheet: n, row: r, column: i } = z.getSelectedView(), a = z.getCellContent(n, r, i), { width: o, height: s } = an(z, n, r, i);
					B.setEditingCell({
						sheet: n,
						row: r,
						column: i,
						text: a,
						cursorStart: a.length,
						cursorEnd: a.length,
						focus: "cell",
						referencedRange: null,
						activeRanges: [],
						mode: "accept",
						editorWidth: o,
						editorHeight: s
					}), t.stopPropagation(), e.refresh();
				},
				children: [
					/* @__PURE__ */ G("canvas", {
						className: "ic-worksheet-sheet-canvas",
						ref: n
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-worksheet-cell-array-structure",
						ref: u
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-worksheet-cell-outline",
						ref: c
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-worksheet-editor-wrapper",
						ref: o,
						children: /* @__PURE__ */ G(Pn, {
							originalText: B.getEditingText(),
							onEditEnd: () => {
								e.refresh();
							},
							onTextUpdated: () => {
								e.refresh();
							},
							model: z,
							workbookState: B,
							type: "cell",
							canEdit: ue
						})
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-worksheet-area-outline",
						ref: l
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-worksheet-extend-to-outline",
						ref: d
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-worksheet-column-resize-guide",
						ref: f
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-worksheet-row-resize-guide",
						ref: p
					}),
					/* @__PURE__ */ G("div", {
						className: "ic-worksheet-column-headers",
						ref: m
					}),
					R ? /* @__PURE__ */ G(os, {
						cell: R,
						onFollow: (e) => {
							h.current?.followLink(e);
						},
						onEdit: e.onEditLink,
						onDelete: e.onDeleteLink,
						onHide: ce,
						onPointerEnter: se,
						onPointerLeave: le
					}) : null
				]
			}),
			/* @__PURE__ */ G(ns, {
				open: g,
				onClose: () => _(!1),
				anchorPosition: E ? {
					x: E.left,
					y: E.top
				} : null,
				column: i(z.getSelectedView().column),
				row: z.getSelectedView().row,
				onCut: de,
				onCopy: fe,
				onPaste: pe,
				onInsertColumnLeft: () => {
					let e = z.getSelectedView();
					try {
						z.insertColumns(e.sheet, e.column, 1);
					} catch {
						A(H("error_dialog.error_inserting_columns"));
					}
					_(!1), V();
				},
				onInsertColumnRight: () => {
					let e = z.getSelectedView();
					try {
						z.insertColumns(e.sheet, e.range[3] + 1, 1);
					} catch {
						A(H("error_dialog.error_inserting_columns"));
					}
					_(!1), V();
				},
				onInsertRowAbove: () => {
					let e = z.getSelectedView();
					try {
						z.insertRows(e.sheet, e.row, 1);
					} catch {
						A(H("error_dialog.error_inserting_rows"));
					}
					_(!1), V();
				},
				onInsertRowBelow: () => {
					let e = z.getSelectedView();
					try {
						z.insertRows(e.sheet, e.range[2] + 1, 1);
					} catch {
						A(H("error_dialog.error_inserting_rows"));
					}
					_(!1), V();
				},
				onDeleteColumn: () => {
					let e = z.getSelectedView();
					try {
						z.deleteColumns(e.sheet, e.column, 1);
					} catch {
						A(H("error_dialog.error_deleting_columns"));
					}
					_(!1), V();
				},
				onDeleteRow: () => {
					let e = z.getSelectedView();
					try {
						z.deleteRows(e.sheet, e.row, 1);
					} catch {
						A(H("error_dialog.error_deleting_rows"));
					}
					_(!1), V();
				}
			}),
			/* @__PURE__ */ G(rs, {
				open: v,
				onClose: () => b(!1),
				anchorPosition: E ? {
					x: E.left,
					y: E.top
				} : null,
				onInsertColumnsLeft: () => {
					let e = z.getSelectedView(), t = e.range[1], n = e.range[3];
					try {
						z.insertColumns(e.sheet, e.column, n - t + 1);
					} catch {
						A(H("error_dialog.error_inserting_columns"));
					}
					b(!1);
				},
				onInsertColumnsRight: () => {
					let e = z.getSelectedView(), t = e.range[1], n = e.range[3];
					try {
						z.insertColumns(e.sheet, n + 1, n - t + 1);
					} catch {
						A(H("error_dialog.error_inserting_columns"));
					}
					b(!1);
				},
				onMoveColumnsLeft: () => {
					let e = z.getSelectedView(), t = e.range[1], n = e.range[3];
					try {
						z.moveColumns(e.sheet, t, n - t + 1, -1);
					} catch {
						A(H("error_dialog.error_moving_columns"));
					}
					b(!1);
				},
				onMoveColumnsRight: () => {
					let e = z.getSelectedView(), t = e.range[1], n = e.range[3];
					try {
						z.moveColumns(e.sheet, t, n - t + 1, 1);
					} catch {
						A(H("error_dialog.error_moving_columns"));
					}
					b(!1);
				},
				onSetColumnWidth: () => {
					let e = z.getSelectedView(), t = z.getColumnWidth(e.sheet, e.range[1]);
					ee(`${t}`), M(!0), b(!1);
				},
				onFreezeColumns: () => {
					let e = z.getSelectedView();
					z.setFrozenColumnsCount(e.sheet, e.column), b(!1);
				},
				onUnfreezeColumns: () => {
					let e = z.getSelectedSheet();
					z.setFrozenColumnsCount(e, 0), b(!1);
				},
				onDeleteColumns: () => {
					let e = z.getSelectedView(), t = e.range[1], n = e.range[3];
					try {
						z.deleteColumns(e.sheet, t, n - t + 1);
					} catch {
						A(H("error_dialog.error_deleting_columns"));
					}
					b(!1);
				},
				range: (() => {
					let e = z.getSelectedView().range;
					return {
						rowStart: e[0],
						columnStart: i(e[1]),
						rowEnd: e[2],
						columnEnd: i(e[3]),
						columnCount: e[3] - e[1] + 1
					};
				})(),
				frozenColumnsCount: z.getFrozenColumnsCount(z.getSelectedSheet()),
				onHideColumns: () => {
					let e = z.getSelectedView(), t = e.range[1], n = e.range[3];
					z.setColumnsHidden(e.sheet, t, n, !0), b(!1);
				},
				onShowHiddenColumns: () => {
					let e = z.getSelectedView(), t = e.range[1], n = e.range[3];
					z.setColumnsHidden(e.sheet, t, n, !1), b(!1);
				},
				hiddenColumnsCount: (() => {
					let e = [], t = z.getSelectedView(), n = t.range[1], r = t.range[3];
					for (let i = n; i <= r; i++) z.getColumnWidth(t.sheet, i) === 0 && e.push(i);
					return e.length;
				})()
			}),
			/* @__PURE__ */ G(is, {
				open: S,
				onClose: () => C(!1),
				anchorPosition: E ? {
					x: E.left,
					y: E.top
				} : null,
				onInsertRowsAbove: () => {
					let e = z.getSelectedView(), t = e.range[0], n = e.range[2];
					try {
						z.insertRows(e.sheet, e.row, n - t + 1);
					} catch {
						A(H("error_dialog.error_inserting_rows"));
					}
					C(!1);
				},
				onInsertRowsBelow: () => {
					let e = z.getSelectedView(), t = e.range[0], n = e.range[2];
					try {
						z.insertRows(e.sheet, e.row + 1, n - t + 1);
					} catch {
						A(H("error_dialog.error_inserting_rows"));
					}
					C(!1);
				},
				onMoveRowsUp: () => {
					let e = z.getSelectedView(), t = e.range[0], n = e.range[2];
					try {
						z.moveRows(e.sheet, t, n - t + 1, -1);
					} catch {
						A(H("error_dialog.error_moving_rows"));
					}
					C(!1);
				},
				onMoveRowsDown: () => {
					let e = z.getSelectedView(), t = e.range[0], n = e.range[2];
					try {
						z.moveRows(e.sheet, t, n - t + 1, 1);
					} catch {
						A(H("error_dialog.error_moving_rows"));
					}
					C(!1);
				},
				onSetRowHeight: () => {
					let e = z.getSelectedView(), t = z.getRowHeight(e.sheet, e.range[0]);
					re(`${t}`), te(!0), C(!1);
				},
				onFreezeRows: () => {
					let e = z.getSelectedView();
					z.setFrozenRowsCount(e.sheet, e.row), C(!1);
				},
				onUnfreezeRows: () => {
					let e = z.getSelectedSheet();
					z.setFrozenRowsCount(e, 0), C(!1);
				},
				onDeleteRows: () => {
					let e = z.getSelectedView(), t = e.range[0], n = e.range[2];
					try {
						z.deleteRows(e.sheet, t, n - t + 1);
					} catch {
						A(H("error_dialog.error_deleting_rows"));
					}
					C(!1);
				},
				onHideRows: () => {
					let e = z.getSelectedView(), t = e.range[0], n = e.range[2];
					z.setRowsHidden(e.sheet, t, n, !0), C(!1);
				},
				onShowHiddenRows: () => {
					let e = z.getSelectedView(), t = e.range[0], n = e.range[2];
					z.setRowsHidden(e.sheet, t, n, !1), C(!1);
				},
				range: (() => {
					let e = z.getSelectedView().range;
					return {
						rowStart: e[0],
						columnStart: i(e[1]),
						rowEnd: e[2],
						columnEnd: i(e[3]),
						columnCount: e[3] - e[1] + 1
					};
				})(),
				frozenRowsCount: z.getFrozenRowsCount(z.getSelectedSheet())
			}),
			/* @__PURE__ */ G(Jt, {
				open: k !== null,
				onClose: () => A(null),
				title: k ?? "",
				message: k ?? ""
			}),
			/* @__PURE__ */ G(Jt, {
				open: P !== null,
				onClose: () => F(null),
				title: H("error_dialog.error_autofill"),
				message: P?.includes("merged cell") ? H("error_dialog.error_autofill_merged") : H("error_dialog.error_autofill_array")
			}),
			/* @__PURE__ */ G(Xt, {
				open: j,
				onClose: () => M(!1),
				title: H("context_menu.column_header.set_column_width"),
				confirmLabel: H("common.apply"),
				cancelLabel: H("common.cancel"),
				defaultValue: N,
				inputProps: {
					type: "number",
					min: 0,
					step: "any",
					endAdornment: "px"
				},
				onSubmit: (e) => {
					let t = Number.parseFloat(e);
					if (!Number.isFinite(t) || t < 0) return;
					let n = z.getSelectedView(), r = n.range[1], i = n.range[3];
					z.setColumnsWidth(n.sheet, r, i, t), h.current?.renderSheet();
				}
			}),
			/* @__PURE__ */ G(Xt, {
				open: I,
				onClose: () => te(!1),
				title: H("context_menu.row_header.set_row_height"),
				confirmLabel: H("common.apply"),
				cancelLabel: H("common.cancel"),
				defaultValue: ne,
				inputProps: {
					type: "number",
					min: 0,
					step: "any",
					endAdornment: "px"
				},
				onSubmit: (e) => {
					let t = Number.parseFloat(e);
					if (!Number.isFinite(t) || t < 0) return;
					let n = z.getSelectedView(), r = n.range[0], i = n.range[2];
					z.setRowsHeight(n.sheet, r, i, t), h.current?.renderSheet();
				}
			})
		]
	});
}), us = (e) => ({ onKeyDown: _((t) => {
	let { key: n } = t, r = n.toLowerCase(), { root: i } = e;
	if (!i.current || t.target !== i.current) return;
	let a = t.metaKey || t.ctrlKey, o = t.shiftKey, s = t.altKey;
	if (a && !o && !s) {
		switch (r) {
			case "z":
				e.canEdit && e.onUndo(), t.stopPropagation(), t.preventDefault();
				break;
			case "y":
				e.canEdit && e.onRedo(), t.stopPropagation(), t.preventDefault();
				break;
			case "b":
				e.canEdit && e.onBold(), t.stopPropagation(), t.preventDefault();
				break;
			case "i":
				e.canEdit && e.onItalic(), t.stopPropagation(), t.preventDefault();
				break;
			case "u":
				e.canEdit && e.onUnderline(), t.stopPropagation(), t.preventDefault();
				break;
			case "a":
				t.stopPropagation(), t.preventDefault();
				break;
			case " ": e.onSelectColumn(), t.stopPropagation(), t.preventDefault();
		}
		sn(n) && (e.onNavigationToEdge(n), t.stopPropagation(), t.preventDefault());
	} else if (a && o && !s) r === "z" && (e.onRedo(), t.stopPropagation(), t.preventDefault());
	else {
		if (o && !s && !a) switch (n) {
			case " ":
				e.onSelectRow(), t.stopPropagation(), t.preventDefault();
				break;
			case "ArrowRight":
			case "ArrowLeft":
			case "ArrowUp":
			case "ArrowDown":
				e.onExpandAreaSelectedKeyboard(n);
				break;
			case "Tab": e.onArrowLeft(), t.stopPropagation(), t.preventDefault();
		}
		if (s && !a && !o) switch (n) {
			case "ArrowDown":
				e.onNextSheet(), t.stopPropagation(), t.preventDefault();
				break;
			case "ArrowUp": e.onPreviousSheet(), t.stopPropagation(), t.preventDefault();
		}
		else if (!(a || s)) {
			if (e.canEdit && (on(n) || n === "Backspace")) {
				let r = n === "Backspace" ? "" : n;
				e.onEditKeyPressStart(r), t.stopPropagation(), t.preventDefault();
			} else if (!o) {
				if (n === "F2" && e.canEdit) e.onCellEditStart(), t.stopPropagation(), t.preventDefault();
				else {
					switch (n) {
						case "ArrowRight":
						case "Tab":
							e.onArrowRight();
							break;
						case "ArrowLeft":
							e.onArrowLeft();
							break;
						case "ArrowDown":
						case "Enter":
							e.onArrowDown();
							break;
						case "ArrowUp":
							e.onArrowUp();
							break;
						case "End":
							e.onKeyEnd();
							break;
						case "Home":
							e.onKeyHome();
							break;
						case "Delete":
							e.canEdit && e.onCellsDeleted();
							break;
						case "PageDown":
							e.onPageDown();
							break;
						case "PageUp":
							e.onPageUp();
							break;
						case "Escape": e.onEscape();
					}
					t.stopPropagation(), t.preventDefault();
				}
			}
		}
	}
}, [e]) });
//#endregion
//#region src/components/LinkDialog/LinkDialog.tsx
function ds({ open: e, onClose: t, sheetNames: n, selectedSheetName: r, initialLink: i, initialLabel: a, onSave: o, onDelete: s }) {
	let c = `${b()}-title`, { modalRef: l, restoreFocus: u } = Kt(e), f = w(null), p = w(null), { t: m } = D(), [h, g] = T("external"), [_, v] = T(null), [x, S] = T(""), [C, E] = T(""), [O, k] = T(""), [A, j] = T(""), [M, N] = T(""), [ee, P] = T(r), [F, I] = T(""), [te, ne] = T(""), [re, ie] = T("");
	y(() => {
		if (e) {
			if (ie(a), ne(i?.tooltip || ""), S(""), E(""), k(""), j(""), N(""), P(r), I(""), !i) g("external"), v(null);
			else if (i.type === "Internal") {
				g("document"), v("document");
				let e = Io(i.location);
				e.sheetName && P(e.sheetName), I(e.cellRef.replace(/\$/g, ""));
			} else if (i.target.startsWith("mailto:")) {
				g("email"), v("email");
				let e = Mo(i.target);
				E(e.address), k(e.subject), j(e.body), N(e.otherParams);
			} else g("external"), v("external"), S(i.target);
		}
	}, [
		e,
		i,
		a,
		r
	]);
	let R = () => {
		t(), u();
	}, ae = h === "external" && x.trim() !== "" && !ko(x), oe = h === "email" && C.trim() !== "" && !Ao(C), se = F.replace(/\$/g, "").trim(), ce = Po.test(se) || Fo.test(se), le = h === "document" && F.trim() !== "" && !ce, z = {
		external: x.trim() === "",
		document: F.trim() === "",
		email: C.trim() === ""
	}[h], B = _ !== null && h === _ && z, V = B;
	switch (h) {
		case "external":
			V ||= ko(x) !== null;
			break;
		case "document":
			V ||= F.trim() !== "" && ce;
			break;
		case "email": V ||= C.trim() !== "" && Ao(C);
	}
	let ue = () => {
		let e = te.trim() || void 0;
		switch (h) {
			case "external": {
				let t = ko(x);
				return t ? {
					type: "External",
					target: t,
					tooltip: e
				} : null;
			}
			case "email": {
				if (!Ao(C)) return null;
				let t = Mo(C.trim()), n = O.trim() || t.subject, r = A.trim() || t.body, i = [t.otherParams, M].filter(Boolean).join("&");
				return {
					type: "External",
					target: No(t.address, n, r, i),
					tooltip: e
				};
			}
			case "document": {
				let t;
				if (Po.test(se)) t = `${d(ee)}!${se.toUpperCase()}`;
				else if (Fo.test(se)) t = se;
				else return null;
				return {
					type: "Internal",
					location: t,
					tooltip: e
				};
			}
		}
	}, de = () => {
		if (B) {
			s(), R();
			return;
		}
		let e = ue();
		e && (o(e, re), R());
	}, fe = () => {
		s(), R();
	}, { onKeyDown: pe } = qt({
		focusableElements: [f, p],
		onClose: R,
		onConfirm: de
	});
	if (!e) return null;
	let H = [
		{
			value: "external",
			label: m("link_dialog.external_tab")
		},
		{
			value: "document",
			label: m("link_dialog.document_tab")
		},
		{
			value: "email",
			label: m("link_dialog.email_tab")
		}
	], me = (e) => {
		e.stopPropagation();
	};
	return /* @__PURE__ */ K(Gt, {
		modalRef: l,
		titleId: c,
		onClose: R,
		onKeyDown: pe,
		className: "ic-link-dialog",
		children: [
			/* @__PURE__ */ K("div", {
				className: "ic-modal-dialog-header",
				children: [/* @__PURE__ */ G("h2", {
					id: c,
					children: m(i ? "link_dialog.title_edit" : "link_dialog.title_add")
				}), /* @__PURE__ */ G(J, {
					ref: f,
					icon: /* @__PURE__ */ G(lt, {}),
					"aria-label": m("link_dialog.close"),
					onClick: R
				})]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-modal-dialog-body",
				children: [
					/* @__PURE__ */ G(Xi, {
						fullWidth: !0,
						size: "md",
						className: "ic-link-dialog-tabs",
						options: H,
						value: h,
						onChange: g
					}),
					h === "external" && /* @__PURE__ */ G(Y, {
						autoFocus: !0,
						placeholder: m("link_dialog.url_placeholder"),
						value: x,
						error: ae,
						helperText: ae ? m("link_dialog.invalid_url") : void 0,
						onChange: (e) => S(e.target.value),
						onKeyDown: me
					}),
					h === "document" && /* @__PURE__ */ K(W, { children: [/* @__PURE__ */ G($n, {
						value: ee,
						options: n.map((e) => ({
							value: e,
							label: e
						})),
						onChange: P
					}), /* @__PURE__ */ G(Y, {
						autoFocus: !0,
						placeholder: m("link_dialog.cell_reference_placeholder"),
						value: F,
						error: le,
						helperText: le ? m("link_dialog.invalid_reference") : void 0,
						onChange: (e) => I(e.target.value),
						onKeyDown: me
					})] }),
					h === "email" && /* @__PURE__ */ K(W, { children: [
						/* @__PURE__ */ G(Y, {
							autoFocus: !0,
							placeholder: m("link_dialog.email_placeholder"),
							value: C,
							error: oe,
							helperText: oe ? m("link_dialog.invalid_email") : void 0,
							onChange: (e) => E(e.target.value),
							onKeyDown: me
						}),
						/* @__PURE__ */ G(Y, {
							placeholder: m("link_dialog.subject_placeholder"),
							value: O,
							onChange: (e) => k(e.target.value),
							onKeyDown: me
						}),
						/* @__PURE__ */ G(Y, {
							placeholder: m("link_dialog.body_placeholder"),
							value: A,
							onChange: (e) => j(e.target.value),
							onKeyDown: me
						})
					] }),
					/* @__PURE__ */ G(Y, {
						placeholder: m("link_dialog.tooltip_placeholder"),
						value: te,
						onChange: (e) => ne(e.target.value),
						onKeyDown: me
					}),
					/* @__PURE__ */ G(Y, {
						placeholder: m("link_dialog.label_placeholder"),
						value: re,
						onChange: (e) => ie(e.target.value),
						onKeyDown: me
					})
				]
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-modal-dialog-footer ic-link-dialog-footer",
				children: [i ? /* @__PURE__ */ G(q, {
					size: "md",
					variant: "ghost",
					className: "ic-link-dialog-delete",
					startIcon: /* @__PURE__ */ G(rt, { size: 14 }),
					onClick: fe,
					children: m("link_dialog.delete")
				}) : /* @__PURE__ */ G("span", {}), /* @__PURE__ */ G(q, {
					ref: p,
					size: "md",
					startIcon: /* @__PURE__ */ G(L, { size: 14 }),
					onClick: de,
					disabled: !V,
					children: m("link_dialog.save")
				})]
			})
		]
	});
}
ds.displayName = "LinkDialog";
//#endregion
//#region src/components/Workbook/Workbook.tsx
function fs(e) {
	return e === void 0 ? "" : typeof e == "string" ? e : `[${e[0]}, ${e[1]}]`;
}
var ps = (e) => {
	let { model: t, workbookState: n, canEdit: r = !0 } = e, { t: i } = D(), a = w(null), o = w(null), s = w(null), l = T(0)[1], [u, d] = T(null), [f, p] = T(!1), [m, h] = T(360), [g, v] = T("namedRanges"), [b, x] = T(null), S = _((e) => {
		v(e), p(!0);
	}, []), C = t.getWorksheetsProperties(), E = C.map(({ name: e, color: n, sheet_id: r, state: i }) => ({
		name: e,
		color: t.resolveColor(n) || "var(--palette-common-white)",
		sheetId: r,
		state: i
	})), O = _(() => {
		if (!document.activeElement?.closest(".ic-color-picker, .ic-advanced-color-picker-panel, .ic-border-picker, .ic-modal-dialog") && a.current) {
			a.current.focus({ preventScroll: !0 });
			let e = window.getSelection();
			if (e) {
				e.empty();
				let t = new Range();
				t.setStart(a.current.firstChild, 0), t.setEnd(a.current.firstChild, 0), e.addRange(t);
			}
		}
	}, []), k = () => {
		t.redo(), l((e) => e + 1);
	}, A = () => {
		t.undo(), l((e) => e + 1);
	}, j = (e, n) => {
		let { sheet: r, range: [i, a, o, s] } = t.getSelectedView(), c = {
			sheet: r,
			row: Math.min(i, o),
			column: Math.min(a, s),
			width: Math.abs(s - a) + 1,
			height: Math.abs(o - i) + 1
		};
		t.updateRangeStyle(c, e, n), l((e) => e + 1);
	}, M = (e) => {
		j("font.u", `${e}`);
	}, N = (e) => {
		j("font.i", `${e}`);
	}, ee = (e) => {
		j("font.b", `${e}`);
	}, P = (e) => {
		j("font.strike", `${e}`);
	}, F = (e) => {
		j("alignment.horizontal", e);
	}, I = (e) => {
		j("alignment.vertical", e);
	}, te = (e) => {
		j("alignment.wrap_text", `${e}`);
	}, ne = () => {
		let { sheet: e, range: [n, r, i, a] } = t.getSelectedView();
		return {
			sheet: e,
			row: Math.min(n, i),
			column: Math.min(r, a),
			width: Math.abs(a - r) + 1,
			height: Math.abs(i - n) + 1
		};
	}, re = () => {
		let e = ne();
		return t.getMergedCells(e.sheet).some((t) => t.row <= e.row + e.height - 1 && t.row + t.height - 1 >= e.row && t.column <= e.column + e.width - 1 && t.column + t.width - 1 >= e.column);
	}, ie = (e) => {
		let n = ne();
		try {
			switch (e) {
				case "merge":
					t.mergeCells(n);
					break;
				case "merge_center":
					t.mergeCellsCenter(n);
					break;
				case "merge_across":
					t.mergeCellsAcross(n);
					break;
				case "merge_down":
					t.mergeCellsDown(n);
					break;
				case "unmerge": t.unmergeCells(n);
			}
		} catch (e) {
			`${e}`.includes("more than one cell has content") && d({
				title: i("error_dialog.error_merging_cells"),
				message: i("error_dialog.error_merging_cells_content")
			});
		}
		l((e) => e + 1);
	}, L = (e) => {
		let t = `${e}`;
		d({
			title: i("error_dialog.error_paste"),
			message: t.includes("merged cell") ? i("error_dialog.error_paste_merged") : t
		});
	}, R = () => {
		let e = ne();
		if (e.width >= 16384 || e.height >= 1048576) return {
			canMerge: !1,
			canMergeAcross: !1,
			canMergeDown: !1,
			canUnmerge: !1
		};
		let t = re(), n = !t && e.width * e.height > 1;
		return {
			canMerge: n,
			canMergeAcross: n && e.width > 1,
			canMergeDown: n && e.height > 1,
			canUnmerge: t
		};
	}, ae = (e) => {
		j("font.color", fs(e));
	}, oe = (e) => {
		j("fill.color", fs(e));
	}, se = (e) => {
		j("num_fmt", e);
	}, ce = (e) => {
		j("font.size_delta", `${e}`);
	}, le = (e) => {
		j("font.size", `${e}`);
	}, z = _(async () => {
		O();
		try {
			let e = await navigator.clipboard.read(), t = new DataTransfer();
			for (let n of e) for (let e of n.types) t.setData(e, await (await n.getType(e)).text());
			!t.getData("application/json") && s.current && t.setData("application/json", s.current), a.current?.dispatchEvent(new ClipboardEvent("paste", {
				clipboardData: t,
				bubbles: !0,
				cancelable: !0
			}));
		} catch {
			try {
				let e = await navigator.clipboard.readText(), t = new DataTransfer();
				t.setData("text/plain", e), s.current && t.setData("application/json", s.current), a.current?.dispatchEvent(new ClipboardEvent("paste", {
					clipboardData: t,
					bubbles: !0,
					cancelable: !0
				}));
			} catch {
				d({
					title: i("error_dialog.error_deleting_cells"),
					message: i("error_dialog.error_clipboard_paste")
				});
			}
		}
	}, [O, i]), B = () => {
		let { sheet: e, range: [r, i, o, s] } = t.getSelectedView(), c = Math.min(r, o), l = Math.min(i, s), u = Math.max(r, o), d = Math.max(i, s), f = [];
		for (let n = c; n <= u; n++) {
			let r = [];
			for (let i = l; i <= d; i++) r.push(t.getCellStyle(e, n, i).style);
			f.push(r);
		}
		n.setCopyStyles(f);
		let p = a.current?.getElementsByClassName("ic-worksheet-sheet-container")[0];
		p && (p.style.cursor = "url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20class%3D%22lucide%20lucide-paint-roller%22%20style%3D%22transform%3Arotate(-8deg)%22%3E%3Crect%20width%3D%2216%22%20height%3D%226%22%20x%3D%222%22%20y%3D%222%22%20rx%3D%222%22%3E%3C%2Frect%3E%3Cpath%20d%3D%22M10%2016v-2a2%202%200%200%201%202-2h8a2%202%200%200%200%202-2V7a2%202%200%200%200-2-2h-2%22%3E%3C%2Fpath%3E%3Crect%20width%3D%224%22%20height%3D%226%22%20x%3D%228%22%20y%3D%2216%22%20rx%3D%221%22%3E%3C%2Frect%3E%3C%2Fsvg%3E'), auto");
	}, V = t.getFmtSettings(), ue = w(null);
	ue.current === null && (ue.current = c());
	let de = ue.current ?? [], fe = (e) => {
		t.setTheme(e), l((e) => e + 1);
	}, { onKeyDown: pe } = us({
		canEdit: r,
		onCellsDeleted: () => {
			let { sheet: e, range: [n, r, a, o] } = t.getSelectedView(), s = Math.min(n, a), c = Math.min(r, o), u = Math.abs(o - r), f = Math.abs(a - n);
			try {
				t.rangeClearContents(e, s, c, s + f, c + u);
			} catch (e) {
				d({
					title: i("error_dialog.error_deleting_cells"),
					message: `${e}`
				});
			}
			l((e) => e + 1);
		},
		onExpandAreaSelectedKeyboard: (e) => {
			t.onExpandSelectedRange(e), l((e) => e + 1);
		},
		onEditKeyPressStart: (e) => {
			let { sheet: r, row: i, column: a } = t.getSelectedView(), { width: o, height: s } = an(t, r, i, a);
			n.setEditingCell({
				sheet: r,
				row: i,
				column: a,
				text: e,
				cursorStart: e.length,
				cursorEnd: e.length,
				focus: "cell",
				referencedRange: null,
				activeRanges: [],
				mode: "accept",
				editorWidth: o,
				editorHeight: s
			}), l((e) => e + 1);
		},
		onCellEditStart: () => {
			let { sheet: e, row: r, column: i } = t.getSelectedView(), a = t.getCellContent(e, r, i), { width: o, height: s } = an(t, e, r, i);
			n.setEditingCell({
				sheet: e,
				row: r,
				column: i,
				text: a,
				cursorStart: a.length,
				cursorEnd: a.length,
				referencedRange: null,
				focus: "cell",
				activeRanges: [],
				mode: "edit",
				editorWidth: o,
				editorHeight: s
			}), l((e) => e + 1);
		},
		onBold: () => {
			let { sheet: e, row: n, column: r } = t.getSelectedView(), i = t.getCellStyle(e, n, r).style.font.b;
			ee(!i);
		},
		onItalic: () => {
			let { sheet: e, row: n, column: r } = t.getSelectedView(), i = t.getCellStyle(e, n, r).style.font.i;
			N(!i);
		},
		onUnderline: () => {
			let { sheet: e, row: n, column: r } = t.getSelectedView(), i = t.getCellStyle(e, n, r).style.font.u;
			M(!i);
		},
		onNavigationToEdge: (e) => {
			if (e === "Home") { t.setSelectedCell(1, 1); t.setTopLeftVisibleCell(1, 1); } else { t.onNavigateToEdgeInDirection(e); }
			l((e) => e + 1);
		},
		onPageDown: () => {
			t.onPageDown(), l((e) => e + 1);
		},
		onPageUp: () => {
			t.onPageUp(), l((e) => e + 1);
		},
		onArrowDown: () => {
			t.onArrowDown(), l((e) => e + 1);
		},
		onArrowUp: () => {
			t.onArrowUp(), l((e) => e + 1);
		},
		onArrowLeft: () => {
			t.onArrowLeft(), l((e) => e + 1);
		},
		onArrowRight: () => {
			t.onArrowRight(), l((e) => e + 1);
		},
		onKeyHome: () => {
			let e = t.getSelectedView(), n = t.getSelectedCell();
			t.setSelectedCell(n[1], 1), t.setTopLeftVisibleCell(e.top_row, 1), l((e) => e + 1);
		},
		onKeyEnd: () => {
			let e = t.getSelectedView(), n = t.getSelectedCell();
			t.setSelectedCell(n[1], $t), t.setTopLeftVisibleCell(e.top_row, $t - 5), l((e) => e + 1);
		},
		onUndo: () => {
			t.undo(), l((e) => e + 1);
		},
		onRedo: () => {
			t.redo(), l((e) => e + 1);
		},
		onNextSheet: () => {
			let e = t.getSelectedSheet() + 1;
			e >= t.getWorksheetsProperties().length ? t.setSelectedSheet(0) : t.setSelectedSheet(e);
		},
		onPreviousSheet: () => {
			let e = t.getSelectedSheet() - 1;
			e < 0 ? t.setSelectedSheet(t.getWorksheetsProperties().length - 1) : t.setSelectedSheet(e);
		},
		onEscape: () => {
			n.clearCutRange(), n.setCopyStyles(null);
			let e = a.current?.getElementsByClassName("ic-worksheet-sheet-container")[0];
			e && (e.style.cursor = "auto"), l((e) => e + 1);
		},
		onSelectColumn: () => {
			let { column: e } = t.getSelectedView();
			t.setSelectedRange(1, e, en, e), l((e) => e + 1);
		},
		onSelectRow: () => {
			let { row: e } = t.getSelectedView();
			t.setSelectedRange(e, 1, e, $t), l((e) => e + 1);
		},
		root: a
	});
	y(() => {
		a.current && (n.getEditingCell() || (document.activeElement && document.activeElement !== document.body && !document.activeElement.closest(".ic-root")) || O());
	});
	let H = _(() => {
		let { row: e, column: n, range: [r, i, a, o] } = t.getSelectedView();
		return un({
			rowStart: r,
			rowEnd: a,
			columnStart: i,
			columnEnd: o
		}, {
			row: e,
			column: n
		});
	}, [t]), [me, he] = (() => {
		if (n.getEditingCell()) return [n.getEditingText(), !0];
		let { sheet: e, row: r, column: i } = t.getSelectedView(), a = t.getCellArrayStructure(e, r, i);
		if (a !== "SingleCell" && !("DynamicAnchor" in a) && !("DynamicChild" in a)) {
			if ("ArrayAnchor" in a) return [`{${t.getCellContent(e, r, i)}}`, !1];
			if ("ArrayChild" in a) {
				let n = a.ArrayChild;
				return [`{${t.getCellContent(e, n[0], n[1])}}`, !1];
			}
		}
		return [t.getCellContent(e, r, i), !0];
	})(), U = _(() => {
		let { sheet: e, row: n, column: r } = t.getSelectedView();
		return t.getCellStyle(e, n, r).style;
	}, [t])(), ge = t.getTheme(), _e = (e, t, n) => {
		x({
			sheet: e,
			row: t,
			column: n
		});
	};
	return /* @__PURE__ */ K("div", {
		className: `ic-workbook-container${r ? "" : " ic-workbook-container--readonly"}`,
		ref: a,
		onKeyDown: pe,
		tabIndex: 0,
		onClick: (e) => {
			n.getEditingCell() ? e.stopPropagation() : O();
		},
		onPaste: (e) => {
			if (!r) {
				e.preventDefault(), e.stopPropagation();
				return;
			}
			n.clearCutRange();
			let { items: i } = e.clipboardData;
			if (!i) return;
			let a = [
				"application/json",
				"text/plain",
				"text/csv",
				"text/html"
			], o = null, s = null;
			for (let t = 0; t < a.length && (o = a[t], s = e.clipboardData.getData(o), !s); t += 1);
			if (o && s) {
				if (o === "application/json") {
					let e = JSON.parse(s), n = /* @__PURE__ */ new Map(), r = e.sheetData;
					for (let e of Object.keys(r)) {
						let t = r[e], i = /* @__PURE__ */ new Map();
						for (let e of Object.keys(t)) i.set(Number.parseInt(e, 10), t[e]);
						n.set(Number.parseInt(e, 10), i);
					}
					try {
						t.pasteFromClipboard(e.sheet, e.area, n, e.type === "cut"), l((e) => e + 1);
					} catch (e) {
						L(e);
					}
				} else if (o === "text/plain") {
					let { sheet: e, range: [n, r, i, a] } = t.getSelectedView(), o = {
						sheet: e,
						row: Math.min(n, i),
						column: Math.min(r, a),
						width: Math.abs(a - r) + 1,
						height: Math.abs(i - n) + 1
					};
					try {
						t.pasteCsvText(o, s), l((e) => e + 1);
					} catch (e) {
						L(e);
					}
				}
				e.preventDefault(), e.stopPropagation();
			}
		},
		onCopy: (e) => {
			let n = t.copyToClipboard(), r = t.getSelectedSheet(), i = sessionStorage.getItem(mt);
			i || (i = pt(), sessionStorage.setItem(mt, i));
			let a = {};
			n.data.forEach((e, t) => {
				let n = {};
				e.forEach((e, t) => {
					n[t] = e;
				}), a[t] = n;
			});
			let o = JSON.stringify({
				type: "copy",
				area: n.range,
				sheetData: a,
				sheet: r,
				clipboardId: i
			});
			s.current = o, e.clipboardData.setData("text/plain", n.csv.trim()), e.clipboardData.setData("application/json", o), e.preventDefault(), e.stopPropagation();
		},
		onCut: (e) => {
			if (!r) {
				e.preventDefault(), e.stopPropagation();
				return;
			}
			let i = t.copyToClipboard(), a = t.getSelectedSheet(), o = sessionStorage.getItem(mt);
			o || (o = pt(), sessionStorage.setItem(mt, o));
			let c = {};
			i.data.forEach((e, t) => {
				let n = {};
				e.forEach((e, t) => {
					n[t] = e;
				}), c[t] = n;
			});
			let u = JSON.stringify({
				type: "cut",
				area: i.range,
				sheetData: c,
				sheet: a,
				clipboardId: o
			});
			s.current = u, e.clipboardData.setData("text/plain", i.csv), e.clipboardData.setData("application/json", u), n.setCutRange({
				sheet: t.getSelectedSheet(),
				rowStart: i.range[0],
				rowEnd: i.range[2],
				columnStart: i.range[1],
				columnEnd: i.range[3]
			}), e.preventDefault(), e.stopPropagation(), l((e) => e + 1);
		},
		children: [
			r && /* @__PURE__ */ G(Do, {
				canUndo: t.canUndo(),
				canRedo: t.canRedo(),
				onRedo: k,
				onUndo: A,
				onToggleUnderline: M,
				onToggleBold: ee,
				onToggleItalic: N,
				onToggleStrike: P,
				onToggleHorizontalAlign: F,
				onToggleVerticalAlign: I,
				onToggleWrapText: te,
				onCopyStyles: B,
				onTextColorPicked: ae,
				onFillColorPicked: oe,
				onNumberFormatPicked: se,
				onClearFormatting: () => {
					let { sheet: e, range: [n, r, i, a] } = t.getSelectedView();
					t.rangeClearFormatting(e, n, r, i, a), l((e) => e + 1);
				},
				onIncreaseFontSize: (e) => {
					ce(e);
				},
				onSetFontSize: (e) => {
					le(e);
				},
				onDownloadPNG: () => {
					let e = o.current?.getCanvas();
					if (!e) return;
					let { range: [n, r, i, a] } = t.getSelectedView(), [s, c] = e.getCoordinatesByCell(n, r), [l, u] = e.getCoordinatesByCell(i + 1, a + 1), d = (l - s) * es, f = (u - c) * es;
					s *= es, c *= es;
					let p = document.createElement("canvas");
					p.width = d, p.height = f;
					let m = p.getContext("2d");
					if (!m) return;
					m.drawImage(e.canvas, s, c, d, f, 0, 0, d, f);
					let h = document.createElement("a");
					h.href = p.toDataURL("image/png"), h.download = "ironcalc.png", h.click();
				},
				onBorderChanged: (e) => {
					let { sheet: n, range: [r, i, a, o] } = t.getSelectedView(), s = Math.min(r, a), c = Math.min(i, o), u = Math.abs(o - i) + 1, d = Math.abs(a - r) + 1, f = {
						type: e.border,
						item: e
					};
					t.setAreaWithBorder({
						sheet: n,
						row: s,
						column: c,
						width: u,
						height: d
					}, f), l((e) => e + 1);
				},
				fillColor: U.fill.color,
				fontColor: U.font.color,
				fontSize: U.font.sz,
				bold: U.font.b,
				underline: U.font.u,
				italic: U.font.i,
				strike: U.font.strike,
				horizontalAlign: U.alignment ? U.alignment.horizontal : "general",
				verticalAlign: U.alignment?.vertical ? U.alignment.vertical : "bottom",
				wrapText: U.alignment?.wrap_text || !1,
				mergeCellsState: R(),
				onMergeCells: ie,
				canEdit: !0,
				numFmt: U.num_fmt,
				showGridLines: t.getShowGridLines(t.getSelectedSheet()),
				onToggleShowGridLines: (e) => {
					let n = t.getSelectedSheet();
					t.setShowGridLines(n, e), l((e) => e + 1);
				},
				formatOptions: V,
				onOpenConditionalFormatting: () => S("conditionalFormatting"),
				isConditionalFormattingOpen: f && g === "conditionalFormatting",
				onOpenNamedStyles: () => S("namedStyles"),
				isNamedStylesOpen: f && g === "namedStyles",
				onOpenLinkDialog: () => {
					let { sheet: e, row: n, column: r } = t.getSelectedView();
					_e(e, n, r);
				},
				themes: de,
				currentTheme: ge,
				onThemePicked: fe,
				onOpenThemes: () => S("themes")
			}),
			/* @__PURE__ */ K("div", {
				className: "ic-workbook-worksheet-area-left",
				style: { width: f ? `calc(100% - ${m}px)` : "100%" },
				children: [
					/* @__PURE__ */ G(In, {
						cellAddress: H(),
						formulaValue: me,
						onChange: () => {
							l((e) => e + 1), O();
						},
						onTextUpdated: () => {
							l((e) => e + 1);
						},
						model: t,
						workbookState: n,
						openDrawer: () => {
							S("namedRanges");
						},
						canEdit: r && he
					}),
					/* @__PURE__ */ G(ls, {
						model: t,
						workbookState: n,
						refresh: () => {
							l((e) => e + 1);
						},
						ref: o,
						canEdit: r && he,
						onCut: () => {
							O(), document.execCommand("cut");
						},
						onCopy: () => {
							O(), document.execCommand("copy");
						},
						onPaste: z,
						onEditLink: r ? (e, n) => {
							_e(t.getSelectedSheet(), e, n);
						} : void 0,
						onDeleteLink: r ? (e, n) => {
							t.deleteCellLink(t.getSelectedSheet(), e, n), l((e) => e + 1);
						} : void 0
					}),
					/* @__PURE__ */ G(yo, {
						canEdit: r,
						sheets: E,
						selectedIndex: t.getSelectedSheet(),
						workbookState: n,
						onSheetSelected: (e) => {
							E[e].state !== "visible" && t.unhideSheet(e), t.setSelectedSheet(e), l((e) => e + 1);
						},
						onAddBlankSheet: () => {
							t.newSheet(), l((e) => e + 1);
						},
						onSheetColorChanged: (e) => {
							try {
								t.setSheetColor(t.getSelectedSheet(), e), l((e) => e + 1);
							} catch (e) {
								alert(`${e}`);
							}
						},
						onSheetRenamed: (e) => {
							try {
								t.renameSheet(t.getSelectedSheet(), e), l((e) => e + 1);
							} catch (e) {
								alert(`${e}`);
							}
						},
						onSheetDeleted: () => {
							let e = t.getSelectedSheet();
							t.deleteSheet(e), l((e) => e + 1);
						},
						onSheetDuplicated: () => {
							try {
								let e = t.getSelectedSheet();
								t.duplicateSheet(e), l((e) => e + 1);
							} catch (e) {
								alert(`${e}`);
							}
						},
						onHideSheet: () => {
							let e = t.getSelectedSheet();
							t.hideSheet(e), l((e) => e + 1);
						},
						onMoveSheet: (e, n) => {
							t.moveSheet(e, n), l((e) => e + 1);
						},
						onOpenRegionalSettings: () => {
							S("regionalSettings");
						},
						model: t
					})
				]
			}),
			/* @__PURE__ */ G(fo, {
				isOpen: f,
				onClose: () => p(!1),
				width: m,
				onWidthChange: h,
				model: t,
				onUpdate: () => {
					l((e) => e + 1);
				},
				getSelectedArea: () => {
					let e = t.getWorksheetsProperties().map((e) => e.name);
					return fn(t.getSelectedView(), e);
				},
				drawerType: g,
				themes: de,
				currentTheme: t.getTheme(),
				onThemePicked: fe,
				customStyles: (() => {
					let e = new Set(t.getBuiltinNamedStyles().map((e) => e.name.toLowerCase()));
					return t.getNamedStyleList().filter((t) => !e.has(t.toLowerCase())).map((e) => ({
						name: e,
						style: t.getNamedStyle(e)
					}));
				})(),
				builtinStyles: t.getBuiltinNamedStyles(),
				formatOptions: V,
				onApplyNamedStyle: (e) => {
					t.onApplyNamedStyle(e), l((e) => e + 1);
				},
				onAddNamedStyle: (e) => {
					try {
						return t.createNamedStyle(e.name, e.style, e.includes), l((e) => e + 1), { nameError: "" };
					} catch (e) {
						return { nameError: e instanceof Error ? e.message : String(e) };
					}
				},
				onUpdateNamedStyle: (e, n) => {
					try {
						return t.updateNamedStyle(e, n.name, n.style, n.includes), l((e) => e + 1), { nameError: "" };
					} catch (e) {
						return { nameError: e instanceof Error ? e.message : String(e) };
					}
				},
				onDeleteNamedStyle: (e) => {
					t.deleteNamedStyle(e), l((e) => e + 1);
				},
				initialLocale: t.getLocale(),
				initialTimezone: t.getTimezone(),
				initialLanguage: t.getLanguage(),
				onSettingsSave: (e, n, r) => {
					t.setLocale(e), t.setTimezone(n), t.setLanguage(r), l((e) => e + 1);
				}
			}),
			/* @__PURE__ */ G(Jt, {
				open: u !== null,
				onClose: () => d(null),
				title: u?.title ?? "",
				message: u?.message ?? ""
			}),
			b && /* @__PURE__ */ G(ds, {
				open: !0,
				onClose: () => x(null),
				sheetNames: C.map((e) => e.name),
				selectedSheetName: C[b.sheet]?.name ?? C[0]?.name ?? "",
				initialLink: t.getCellLink(b.sheet, b.row, b.column) ?? null,
				initialLabel: t.getFormattedCellValue(b.sheet, b.row, b.column),
				onSave: (e, n) => {
					if (!b) return;
					let { sheet: r, row: i, column: a } = b, o = n.trim() || (e.type === "External" ? e.target.replace(/^mailto:/, "").split("?")[0] : e.location);
					t.setCellLink(r, i, a, e, o), l((e) => e + 1);
				},
				onDelete: () => {
					if (!b) return;
					let { sheet: e, row: n, column: r } = b;
					t.deleteCellLink(e, n, r), l((e) => e + 1);
				}
			})
		]
	});
}, ms = {
	color_picker: {
		add: "Neue Farbe hinzufügen",
		apply: "Farbe hinzufügen",
		cancel: "Abbrechen",
		default: "Standard",
		no_fill: "Keine Füllung",
		recent: "Zuletzt verwendet",
		standard_colors: "Standardfarben",
		themed_colors: "Designfarben",
		title: "Farbwähler"
	},
	common: {
		apply: "Anwenden",
		cancel: "Abbrechen"
	},
	conditional_formatting: {
		add_new_rule: "Neue Regel hinzufügen",
		apply: "Änderungen übernehmen",
		apply_preset: "Vordefinierter Stil anwenden",
		apply_to: "Anwenden auf",
		apply_to_placeholder: "z.B. A1:B10",
		apply_to_range: "Bereich",
		back_to_list: "Zurück zur Liste",
		cancel: "Abbrechen",
		color_scale_maximum: "Maximum",
		color_scale_midpoint: "Mittelpunkt",
		color_scale_minimum: "Minimum",
		color_scale_settings: "Einstellungen",
		color_scale_type_formula: "Formel",
		color_scale_type_max: "Max",
		color_scale_type_min: "Min",
		color_scale_type_none: "Keine",
		color_scale_type_number: "Zahl",
		color_scale_type_percent: "Prozent",
		color_scale_type_percentile: "Perzentil",
		data_bars_gradient_fill: "Verlaufsfüllung",
		data_bars_maximum: "Maximum",
		data_bars_minimum: "Minimum",
		data_bars_negative: "Negativ",
		data_bars_positive: "Positiv",
		data_bars_preferences: "Einstellungen",
		data_bars_settings: "Einstellungen",
		data_bars_show_value: "Zellenwert anzeigen",
		data_bars_solid_fill: "Einfarbige Füllung",
		data_bars_type_automatic: "Automatisch",
		default_styles: "Voreinstellungen",
		delete_rule: "Regel löschen",
		desc_cell_value: "Zellenwert {{op}}",
		desc_cell_value_between: "Zellenwert zwischen {{value}} und {{value2}}",
		desc_cell_value_not_between: "Zellenwert nicht zwischen {{value}} und {{value2}}",
		desc_color_scale: "Farbskala",
		desc_data_bars: "Datenbalken",
		desc_date: "Datum {{op}}",
		desc_date_between: "Datum zwischen {{value}} und {{value2}}",
		desc_date_not_between: "Datum nicht zwischen {{value}} und {{value2}}",
		desc_formula: "Formel: {{value}}",
		desc_op_begins_with: "beginnt mit",
		desc_op_between: "zwischen",
		desc_op_contains: "enthält",
		desc_op_does_not_contain: "enthält nicht",
		desc_op_ends_with: "endet mit",
		desc_op_equals: "ist genau",
		desc_op_in_last_7_days: "in den letzten 7 Tagen",
		desc_op_in_next_7_days: "in den nächsten 7 Tagen",
		desc_op_last_month: "im letzten Monat",
		desc_op_last_week: "in der letzten Woche",
		desc_op_last_year: "im letzten Jahr",
		desc_op_next_month: "im nächsten Monat",
		desc_op_next_week: "in der nächsten Woche",
		desc_op_next_year: "im nächsten Jahr",
		desc_op_not_between: "nicht zwischen",
		desc_op_this_month: "in diesem Monat",
		desc_op_this_week: "in dieser Woche",
		desc_op_this_year: "in diesem Jahr",
		desc_op_today: "ist heute",
		desc_op_tomorrow: "ist morgen",
		desc_op_yesterday: "ist gestern",
		desc_text: "Text {{op}}",
		desc_text_value: "Text {{op}} '{{value}}'",
		duplicate_rule: "Regel duplizieren",
		edit_rule: "Regel bearbeiten",
		empty_message1: "Noch keine Regeln für bedingte Formatierung.",
		empty_message2: "Klicke auf 'Neu hinzufügen', um eine anzulegen.",
		filter_label: "Zeigen",
		filter_selection: "Auswahl",
		filter_this_sheet: "Dieses Blatt",
		format_rules: "Formatierungsregeln",
		format_style: "Formatierungsstil",
		formula_error_invalid: "Ungültige Formel",
		formula_error_must_start_with_equals: "Formel muss mit = beginnen",
		formula_placeholder: "z.B. =A1>0",
		highlight_cells_if: "Zellen hervorheben, wenn...",
		icon_sets_else: "Sonst",
		icon_sets_icons: "Symbole",
		icon_sets_mode_preset: "Symbolsätze",
		icon_sets_ratings: "Bewertungen",
		icon_sets_settings: "Einstellungen",
		icon_sets_show_value: "Zellenwert anzeigen",
		icon_sets_when_value_is: "Wenn der Wert",
		move_down: "Priorität verringern",
		move_up: "Priorität erhöhen",
		new: "Neu hinzufügen",
		no_search_results: "Keine Regeln entsprechen Ihrer Suche.",
		op_begins_with: "Beginnt mit",
		op_between: "Zwischen",
		op_contains: "Enthält",
		op_does_not_contain: "Enthält nicht",
		op_does_not_equal: "Ungleich",
		op_ends_with: "Endet mit",
		op_equals: "Gleich",
		op_greater_than: "Größer als",
		op_greater_than_or_equal: "Größer oder gleich",
		op_in_last_7_days: "Letzte 7 Tage",
		op_in_next_7_days: "Nächste 7 Tage",
		op_last_month: "Letzter Monat",
		op_last_week: "Letzte Woche",
		op_last_year: "Letztes Jahr",
		op_less_than: "Kleiner als",
		op_less_than_or_equal: "Kleiner oder gleich",
		op_next_month: "Nächster Monat",
		op_next_week: "Nächste Woche",
		op_next_year: "Nächstes Jahr",
		op_not_between: "Nicht zwischen",
		op_this_month: "Dieser Monat",
		op_this_week: "Diese Woche",
		op_this_year: "Dieses Jahr",
		op_today: "Heute",
		op_tomorrow: "Morgen",
		op_yesterday: "Gestern",
		rule_type_blanks: "Leerzellen",
		rule_type_cell_value: "Zellenwert...",
		rule_type_date: "Datum...",
		rule_type_duplicate_values: "Doppelte Werte",
		rule_type_errors: "Fehler",
		rule_type_formula: "Formel",
		rule_type_no_blanks: "Nicht-Leerzellen",
		rule_type_no_errors: "Keine Fehler",
		rule_type_text: "Text...",
		rule_type_unique_values: "Eindeutige Werte",
		rule_value_placeholder: "Wert",
		search_placeholder: "Suchen...",
		stop_if_true: "Anhalten, wenn wahr",
		tab_classic: "Werte",
		tab_color_scale: "Farbskala",
		tab_data_bars: "Datenbalken",
		tab_icon_sets: "Symbole",
		title: "Bedingte Formatierung",
		use_selection: "Auswahl übernehmen"
	},
	context_menu: {
		cell: {
			copy: "Kopieren",
			cut: "Ausschneiden",
			delete: "Löschen...",
			delete_column: "Spalte '{{column}}'",
			delete_row: "Zeile '{{row}}'",
			insert: "Einfügen...",
			insert_column_left: "Spalte links",
			insert_column_right: "Spalte rechts",
			insert_row_above: "Zeile oben",
			insert_row_below: "Zeile unten",
			paste: "Einfügen"
		},
		column_header: {
			delete_column: "Spalte '{{column}}' löschen",
			delete_columns: "Spalten {{columnStart}} - {{columnEnd}} löschen",
			freeze_columns: "Bis Spalte '{{column}}' fixieren",
			hide_column: "Spalte '{{column}}' ausblenden",
			hide_columns: "Spalten {{columnStart}} - {{columnEnd}} ausblenden",
			insert_columns_after: "{{count}} Spalte(n) rechts einfügen",
			insert_columns_before: "{{count}} Spalte(n) links einfügen",
			move_columns_left: "Spalten nach links verschieben",
			move_columns_right: "Spalten nach rechts verschieben",
			set_column_width: "Spaltenbreite festlegen",
			show_hidden_columns: "Ausgeblendete Spalten einblenden",
			unfreeze_columns: "Fixierung der Spalten aufheben"
		},
		row_header: {
			delete_row: "Zeile '{{row}}' löschen",
			delete_rows: "Zeilen {{rowStart}} - {{rowEnd}} löschen",
			freeze_rows: "Bis Zeile '{{row}}' fixieren",
			hide_row: "Zeile '{{row}}' ausblenden",
			hide_rows: "Zeilen {{rowStart}} - {{rowEnd}} ausblenden",
			insert_rows_above: "{{count}} Zeile(n) oberhalb einfügen",
			insert_rows_below: "{{count}} Zeile(n) unterhalb einfügen",
			move_rows_down: "Zeilen nach unten verschieben",
			move_rows_up: "Zeilen nach oben verschieben",
			set_row_height: "Zeilenhöhe festlegen",
			show_hidden_rows: "Ausgeblendete Zeilen einblenden",
			unfreeze_rows: "Fixierung der Zeilen aufheben"
		}
	},
	error_dialog: {
		error_autofill: "Automatisches Ausfüllen nicht möglich",
		error_autofill_array: "Der Ausfüllbereich kann eine Matrixformel nicht teilweise abdecken.",
		error_autofill_merged: "Der Ausfüllbereich kann eine verbundene Zelle nicht teilweise abdecken.",
		error_clipboard_paste: "Zugriff auf die Zwischenablage verweigert. Bitte erlauben Sie Zwischenablage-Berechtigungen in Ihrem Browser.",
		error_deleting_cells: "Zellen konnten nicht gelöscht werden",
		error_deleting_columns: "Spalten konnten nicht gelöscht werden",
		error_deleting_rows: "Zeilen konnten nicht gelöscht werden",
		error_editing_formula: "Fehler beim Bearbeiten der Formel",
		error_inserting_columns: "Spalten konnten nicht eingefügt werden",
		error_inserting_rows: "Zeilen konnten nicht eingefügt werden",
		error_merging_cells: "Zellen können nicht verbunden werden",
		error_merging_cells_content: "Nur eine Zelle der Auswahl darf Inhalt haben.",
		error_moving_columns: "Spalten konnten nicht verschoben werden",
		error_moving_rows: "Zeilen konnten nicht verschoben werden",
		error_paste: "Einfügen nicht möglich",
		error_paste_merged: "Der eingefügte Bereich kann eine verbundene Zelle nicht teilweise abdecken."
	},
	formula_bar: { manage_named_ranges: "Benannte Bereiche verwalten" },
	link_dialog: {
		body_placeholder: "Nachricht (optional)",
		cell_reference_placeholder: "Zellbezug",
		close: "Schließen",
		delete: "Löschen",
		document_tab: "Dokumentlink",
		email_placeholder: "E-Mail-Adresse",
		email_tab: "E-Mail",
		external_tab: "Externer Link",
		invalid_email: "Bitte gib eine gültige E-Mail-Adresse ein",
		invalid_reference: "Bitte gib einen gültigen Zellbezug ein",
		invalid_url: "Bitte gib eine gültige URL ein",
		label_placeholder: "Beschriftung",
		save: "Speichern",
		subject_placeholder: "Betreff (optional)",
		title_add: "Link hinzufügen",
		title_edit: "Link bearbeiten",
		tooltip_placeholder: "Tooltip (optional)",
		url_placeholder: "URL"
	},
	link_tooltip: {
		break: "Link entfernen",
		copy: "Link kopieren",
		edit: "Link bearbeiten"
	},
	name_manager_dialog: {
		add_new_range: "Neuen Bereich hinzufügen",
		apply: "Änderungen übernehmen",
		back_to_list: "Zurück zur Liste",
		cancel: "Abbrechen",
		default_range_prefix: "Bereich",
		delete: "Bereich löschen",
		edit: "Bereich bearbeiten",
		edit_range: "Bereich bearbeiten",
		empty_message1: "Es wurden noch keine benannten Bereiche hinzugefügt.",
		empty_message2: "Klicke auf „Neu hinzufügen“, um einen anzulegen.",
		enter_formula: "Formel eingeben",
		enter_range_name: "Bereichsnamen eingeben",
		global: "(Global)",
		new: "Neu hinzufügen",
		new_named_range: "Neuer benannter Bereich",
		no_search_results: "Keine benannten Bereiche entsprechen Ihrer Suche.",
		range_name: "Bereichsname",
		refers_to: "Bezieht sich auf",
		scope_filter_all: "Alle",
		scope_filter_current: "Aktuelles Blatt",
		scope_filter_global: "Global",
		scope_helper: "Der Geltungsbereich bestimmt, wo der benannte Bereich verfügbar ist.",
		scope_label: "Scope",
		search_placeholder: "Suchen...",
		title: "Benannte Bereiche",
		use_selection: "Auswahl übernehmen",
		workbook: "Arbeitsmappe"
	},
	named_styles: {
		accent_1: "Akzent 1",
		accent_2: "Akzent 2",
		accent_3: "Akzent 3",
		accent_4: "Akzent 4",
		accent_5: "Akzent 5",
		accent_6: "Akzent 6",
		add_new_style: "Neu hinzufügen",
		alignment_label: "Ausrichtung",
		apply: "Anwenden",
		back_to_list: "Zurück zur Liste",
		background_color_label: "Hintergrundfarbe",
		border_label: "Rahmen",
		cancel: "Abbrechen",
		category_data_and_model: "Daten und Modell",
		category_good_bad_neutral: "Gut, schlecht und neutral",
		category_number_format: "Zahlenformat",
		category_themed_cell_styles: "Designorientierte Zellenformate",
		category_titles_and_headings: "Titel und Überschriften",
		custom_format_placeholder: "z. B. #,##0.00 oder \"€\"#,##0",
		custom_format_required: "Das benutzerdefinierte Format darf nicht leer sein",
		default_name_prefix: "Stil",
		delete_style: "Stil löschen",
		empty_message1: "Keine benutzerdefinierten Stile.",
		empty_message2: "Klicken Sie auf 'Neu hinzufügen', um einen zu erstellen.",
		fill_label: "Füllung",
		font_label: "Schriftart",
		font_style_label: "Stil",
		format_label: "Format",
		horizontal_align_label: "Horizontal",
		line_style_label: "Linienstil",
		manage_styles: "Stile verwalten",
		name_already_exists: "Ein Stil mit diesem Namen existiert bereits",
		name_label: "Name",
		name_placeholder: "Stilname",
		new_style: "Neuer Stil",
		number_label: "Zahl",
		panel_title: "Zellformate",
		section_custom: "Benutzerdefiniert",
		section_theme: "Design",
		style_properties: "Stileigenschaften",
		update_style: "Stil bearbeiten",
		vertical_align_label: "Vertikal"
	},
	navigation: {
		add_sheet: "Tabellenblatt hinzufügen",
		sheet_list: "Tabellenblattliste"
	},
	num_fmt: {
		cancel: "Abbrechen",
		close: "Dialog schließen",
		save: "Speichern",
		title: "Benutzerdefiniertes Zahlenformat"
	},
	regional_settings: {
		language: { display_language: {
			de: "Deutsch",
			en: "English",
			es: "Español",
			fr: "Français",
			it: "Italiano"
		} },
		locale: {
			delimiter_comma: "Komma",
			delimiter_semicolon: "Semikolon",
			locale_example1: "Zahl",
			locale_example2: "Datum und Uhrzeit",
			locale_example3: "Formeltrennzeichen",
			locale_label: "Regionaleinstellung",
			title: "Regionaleinstellung"
		},
		open_regional_settings: "Regionaleinstellungen öffnen",
		timezone: {
			timezone_helper: "Das Ändern dieser Einstellung wirkt sich auf datums- und zeitbezogene Funktionen aus, einschließlich HEUTE() und JETZT().",
			timezone_label: "Zeitzone",
			title: "Zeitzone"
		},
		title: "Regionaleinstellungen"
	},
	right_drawer: {
		close: "Schließen",
		resize_drawer: "Größe der Seitenleiste ändern"
	},
	sheet_delete: {
		cancel: "Abbrechen",
		confirm: "Ja, Tabellenblatt löschen",
		message: "Das Tabellenblatt '{{sheetName}}' wird gelöscht.",
		title: "Bist du sicher?"
	},
	sheet_tab: {
		change_color: "Farbe ändern",
		delete: "Löschen",
		duplicate: "Duplizieren",
		hide_sheet: "Tabellenblatt ausblenden",
		move_left: "Nach links verschieben",
		move_right: "Nach rechts verschieben",
		open_menu: "Tabellenblattmenü öffnen",
		rename: "Umbenennen"
	},
	themes: {
		accent_color_label: "Akzent {{n}}",
		apply: "Anwenden",
		back_to_list: "Zurück zur Liste",
		bg_color_label: "Hintergrund",
		cancel: "Abbrechen",
		custom_theme_name: "Benutzerdefiniert",
		customize_theme: "Design anpassen",
		dark_color_label: "Dunkel",
		fol_hlink_color_label: "Besuchter Hyperlink",
		hlink_color_label: "Hyperlink",
		light_color_label: "Hell",
		manage_themes: "Designs verwalten",
		panel_title: "Designs",
		text_color_label: "Text"
	},
	toolbar: {
		add_link: "Link einfügen",
		align_center: "Zentrieren",
		align_left: "Links ausrichten",
		align_right: "Rechts ausrichten",
		bold: "Fett",
		borders: {
			all: "Alle Rahmen",
			bottom: "Unterer Rahmen",
			clear: "Rahmen entfernen",
			color: "Rahmenfarbe",
			horizontal: "Horizontale Rahmen",
			inner: "Innere Rahmen",
			left: "Linker Rahmen",
			outer: "Äußere Rahmen",
			right: "Rechter Rahmen",
			style: "Rahmenstil",
			title: "Rahmen",
			top: "Oberer Rahmen",
			vertical: "Vertikale Rahmen"
		},
		clear_formatting: "Formatierung löschen",
		conditional_formatting: "Bedingte Formatierung",
		copy_styles: "Formatierung kopieren",
		currency: "Als Währung formatieren",
		decimal_places_decrease: "Dezimalstellen verringern",
		decimal_places_increase: "Dezimalstellen erhöhen",
		decrease_font_size: "Schriftgröße verringern",
		download_png: "Als PNG herunterladen",
		fill_color: "Füllfarbe",
		font_color: "Schriftfarbe",
		font_size: "Schriftgröße",
		format_menu: {
			auto: "Automatisch",
			currency_eur: "Euro (EUR)",
			currency_eur_example: "€",
			currency_gbp: "Britisches Pfund (GBP)",
			currency_gbp_example: "£",
			currency_usd: "Dollar (USD)",
			currency_usd_example: "$",
			custom: "Benutzerdefiniert",
			date_long: "Langes Datum",
			date_short: "Kurzes Datum",
			number: "Zahl",
			percentage: "Prozent",
			percentage_example: "10%"
		},
		format_number: "Zahlenformat",
		increase_font_size: "Schriftgröße erhöhen",
		italic: "Kursiv",
		merge_cells: "Zellen verbinden",
		merge_menu: {
			merge: "Zellen verbinden",
			merge_across: "Zeilenweise verbinden",
			merge_center: "Verbinden und zentrieren",
			merge_down: "Spaltenweise verbinden",
			unmerge: "Zellverbund aufheben"
		},
		named_styles: "Zellformate",
		percentage: "Als Prozent formatieren",
		redo: "Wiederholen",
		scroll_left: "Nach links scrollen",
		scroll_right: "Nach rechts scrollen",
		selected_png: "Ausgewählten Bereich als PNG exportieren",
		show_hide_grid_lines: "Gitternetzlinien ein-/ausblenden",
		strike_through: "Durchgestrichen",
		themes: "Designs",
		underline: "Unterstrichen",
		undo: "Rückgängig",
		vertical_align_bottom: "Unten ausrichten",
		vertical_align_middle: "Mittig ausrichten",
		vertical_align_top: "Oben ausrichten",
		wrap_text: "Text umbrechen"
	}
}, hs = {
	color_picker: {
		add: "Add new color",
		apply: "Add color",
		cancel: "Cancel",
		default: "Default",
		no_fill: "No fill",
		recent: "Recent",
		standard_colors: "Standard colors",
		themed_colors: "Theme colors",
		title: "Color Picker"
	},
	common: {
		apply: "Apply",
		cancel: "Cancel"
	},
	conditional_formatting: {
		add_new_rule: "Add a new rule",
		apply: "Apply changes",
		apply_preset: "Apply preset style",
		apply_to: "Apply to",
		apply_to_placeholder: "e.g. A1:B10",
		apply_to_range: "Range",
		back_to_list: "Back to list",
		cancel: "Cancel",
		color_scale_maximum: "Maximum",
		color_scale_midpoint: "Midpoint",
		color_scale_minimum: "Minimum",
		color_scale_settings: "Settings",
		color_scale_type_formula: "Formula",
		color_scale_type_max: "Max",
		color_scale_type_min: "Min",
		color_scale_type_none: "None",
		color_scale_type_number: "Number",
		color_scale_type_percent: "Percent",
		color_scale_type_percentile: "Percentile",
		data_bars_gradient_fill: "Gradient fill",
		data_bars_maximum: "Maximum",
		data_bars_minimum: "Minimum",
		data_bars_negative: "Negative",
		data_bars_positive: "Positive",
		data_bars_preferences: "Preferences",
		data_bars_settings: "Settings",
		data_bars_show_value: "Show cell value",
		data_bars_solid_fill: "Solid fill",
		data_bars_type_automatic: "Automatic",
		default_styles: "Presets",
		delete_rule: "Delete rule",
		desc_cell_value: "Cell value {{op}}",
		desc_cell_value_between: "Cell value is between {{value}} and {{value2}}",
		desc_cell_value_not_between: "Cell value is not between {{value}} and {{value2}}",
		desc_color_scale: "Color Scale",
		desc_data_bars: "Data Bars",
		desc_date: "Date {{op}}",
		desc_date_between: "Date is between {{value}} and {{value2}}",
		desc_date_not_between: "Date is not between {{value}} and {{value2}}",
		desc_formula: "Formula: {{value}}",
		desc_op_begins_with: "starts with",
		desc_op_between: "is between",
		desc_op_contains: "contains",
		desc_op_does_not_contain: "doesn't contain",
		desc_op_ends_with: "ends with",
		desc_op_equals: "is exactly",
		desc_op_in_last_7_days: "is in Last 7 Days",
		desc_op_in_next_7_days: "is in Next 7 Days",
		desc_op_last_month: "is in Last Month",
		desc_op_last_week: "is in Last Week",
		desc_op_last_year: "is in Last Year",
		desc_op_next_month: "is in Next Month",
		desc_op_next_week: "is in Next Week",
		desc_op_next_year: "is in Next Year",
		desc_op_not_between: "is not between",
		desc_op_this_month: "is in This Month",
		desc_op_this_week: "is in This Week",
		desc_op_this_year: "is in This Year",
		desc_op_today: "is Today",
		desc_op_tomorrow: "is Tomorrow",
		desc_op_yesterday: "is Yesterday",
		desc_text: "Text {{op}}",
		desc_text_value: "Text {{op}} '{{value}}'",
		duplicate_rule: "Duplicate rule",
		edit_rule: "Edit rule",
		empty_message1: "No conditional formatting rules yet.",
		empty_message2: "Click on 'Add new' to add one.",
		filter_label: "Show",
		filter_selection: "Selection",
		filter_this_sheet: "This sheet",
		format_rules: "Format rules",
		format_style: "Format style",
		formula_error_invalid: "Invalid formula",
		formula_error_must_start_with_equals: "Formula must start with =",
		formula_placeholder: "e.g. =A1>0",
		highlight_cells_if: "Highlight cells if...",
		icon_sets_else: "Else",
		icon_sets_icons: "icons",
		icon_sets_mode_preset: "Icon Sets",
		icon_sets_ratings: "Ratings",
		icon_sets_settings: "Settings",
		icon_sets_show_value: "Show cell value",
		icon_sets_when_value_is: "When value is",
		move_down: "Lower priority",
		move_up: "Raise priority",
		new: "Add new",
		no_search_results: "No rules match your search.",
		op_begins_with: "Begins With",
		op_between: "Between",
		op_contains: "Contains",
		op_does_not_contain: "Does Not Contain",
		op_does_not_equal: "Does Not Equal",
		op_ends_with: "Ends With",
		op_equals: "Equals",
		op_greater_than: "Greater Than",
		op_greater_than_or_equal: "Greater Than or Equal To",
		op_in_last_7_days: "Last 7 Days",
		op_in_next_7_days: "Next 7 Days",
		op_last_month: "Last Month",
		op_last_week: "Last Week",
		op_last_year: "Last Year",
		op_less_than: "Less Than",
		op_less_than_or_equal: "Less Than or Equal To",
		op_next_month: "Next Month",
		op_next_week: "Next Week",
		op_next_year: "Next Year",
		op_not_between: "Not Between",
		op_this_month: "This Month",
		op_this_week: "This Week",
		op_this_year: "This Year",
		op_today: "Today",
		op_tomorrow: "Tomorrow",
		op_yesterday: "Yesterday",
		rule_type_blanks: "Blanks",
		rule_type_cell_value: "Cell value...",
		rule_type_date: "Date...",
		rule_type_duplicate_values: "Duplicated Values",
		rule_type_errors: "Errors",
		rule_type_formula: "Formula",
		rule_type_no_blanks: "No Blanks",
		rule_type_no_errors: "No Errors",
		rule_type_text: "Text...",
		rule_type_unique_values: "Unique Values",
		rule_value_placeholder: "Value",
		search_placeholder: "Search...",
		stop_if_true: "Stop if true",
		tab_classic: "Rule based",
		tab_color_scale: "Color Scale",
		tab_data_bars: "Data Bars",
		tab_icon_sets: "Icons",
		title: "Conditional Formatting",
		use_selection: "Use selected range"
	},
	context_menu: {
		cell: {
			copy: "Copy",
			cut: "Cut",
			delete: "Delete...",
			delete_column: "Column '{{column}}'",
			delete_row: "Row '{{row}}'",
			insert: "Insert...",
			insert_column_left: "Column left",
			insert_column_right: "Column right",
			insert_row_above: "Row above",
			insert_row_below: "Row below",
			paste: "Paste"
		},
		column_header: {
			delete_column: "Delete column '{{column}}'",
			delete_columns: "Delete columns {{columnStart}} - {{columnEnd}}",
			freeze_columns: "Freeze up to column '{{column}}'",
			hide_column: "Hide column '{{column}}'",
			hide_columns: "Hide columns {{columnStart}} - {{columnEnd}}",
			insert_columns_after: "Insert {{count}} column(s) right",
			insert_columns_before: "Insert {{count}} column(s) left",
			move_columns_left: "Move columns left",
			move_columns_right: "Move columns right",
			set_column_width: "Set column width",
			show_hidden_columns: "Show hidden columns",
			unfreeze_columns: "Unfreeze columns"
		},
		row_header: {
			delete_row: "Delete row '{{row}}'",
			delete_rows: "Delete rows {{rowStart}} - {{rowEnd}}",
			freeze_rows: "Freeze up to row '{{row}}'",
			hide_row: "Hide row '{{row}}'",
			hide_rows: "Hide rows {{rowStart}} - {{rowEnd}}",
			insert_rows_above: "Insert {{count}} row(s) above",
			insert_rows_below: "Insert {{count}} row(s) below",
			move_rows_down: "Move rows down",
			move_rows_up: "Move rows up",
			set_row_height: "Set row height",
			show_hidden_rows: "Show hidden rows",
			unfreeze_rows: "Unfreeze rows"
		}
	},
	error_dialog: {
		error_autofill: "Cannot auto-fill",
		error_autofill_array: "The fill area cannot cover part of an array formula.",
		error_autofill_merged: "The fill area cannot cover part of a merged cell.",
		error_clipboard_paste: "Clipboard access denied. Please allow clipboard permissions in your browser.",
		error_deleting_cells: "Failed to delete cells",
		error_deleting_columns: "Failed to delete columns",
		error_deleting_rows: "Failed to delete rows",
		error_editing_formula: "Error editing formula",
		error_inserting_columns: "Failed to insert columns",
		error_inserting_rows: "Failed to insert rows",
		error_merging_cells: "Cannot merge cells",
		error_merging_cells_content: "Only one cell in the selection can have content.",
		error_moving_columns: "Failed to move columns",
		error_moving_rows: "Failed to move rows",
		error_paste: "Cannot paste",
		error_paste_merged: "The pasted area cannot cover part of a merged cell."
	},
	formula_bar: { manage_named_ranges: "Manage Named Ranges" },
	link_dialog: {
		body_placeholder: "Body (optional)",
		cell_reference_placeholder: "Cell reference",
		close: "Close",
		delete: "Delete",
		document_tab: "Document link",
		email_placeholder: "Email address",
		email_tab: "Email",
		external_tab: "External link",
		invalid_email: "Please enter a valid email address",
		invalid_reference: "Please enter a valid cell reference",
		invalid_url: "Please enter a valid URL",
		label_placeholder: "Label",
		save: "Save",
		subject_placeholder: "Subject (optional)",
		title_add: "Add link",
		title_edit: "Edit link",
		tooltip_placeholder: "Tooltip (optional)",
		url_placeholder: "URL"
	},
	link_tooltip: {
		break: "Break link",
		copy: "Copy link",
		edit: "Edit link"
	},
	name_manager_dialog: {
		add_new_range: "Add a new range",
		apply: "Apply changes",
		back_to_list: "Back to list",
		cancel: "Cancel",
		default_range_prefix: "Range",
		delete: "Delete Range",
		edit: "Edit Range",
		edit_range: "Edit range",
		empty_message1: "No named ranges added yet.",
		empty_message2: "Click on 'Add new' to add one.",
		enter_formula: "Enter formula",
		enter_range_name: "Enter range name",
		global: "(Global)",
		new: "Add new",
		new_named_range: "New Named Range",
		no_search_results: "No named ranges match your search.",
		range_name: "Range name",
		refers_to: "Refers to",
		scope_filter_all: "All",
		scope_filter_current: "Current sheet",
		scope_filter_global: "Global",
		scope_helper: "The scope of the named range determines where it is available.",
		scope_label: "Scope",
		search_placeholder: "Search...",
		title: "Named Ranges",
		use_selection: "Use selected range",
		workbook: "Workbook"
	},
	named_styles: {
		accent_1: "Accent 1",
		accent_2: "Accent 2",
		accent_3: "Accent 3",
		accent_4: "Accent 4",
		accent_5: "Accent 5",
		accent_6: "Accent 6",
		add_new_style: "Add new",
		alignment_label: "Alignment",
		apply: "Apply",
		back_to_list: "Back to list",
		background_color_label: "Background color",
		border_label: "Border",
		cancel: "Cancel",
		category_data_and_model: "Data and Model",
		category_good_bad_neutral: "Good, Bad and Neutral",
		category_number_format: "Number Format",
		category_themed_cell_styles: "Themed Cell Styles",
		category_titles_and_headings: "Titles and Headings",
		custom_format_placeholder: "e.g. #,##0.00 or \"€\"#,##0",
		custom_format_required: "Custom format cannot be empty",
		default_name_prefix: "Style",
		delete_style: "Delete style",
		empty_message1: "No custom styles yet.",
		empty_message2: "Click on 'Add new' to add one.",
		fill_label: "Fill",
		font_label: "Font",
		font_style_label: "Style",
		format_label: "Format",
		horizontal_align_label: "Horizontal",
		line_style_label: "Line style",
		manage_styles: "Manage styles",
		name_already_exists: "A style with this name already exists",
		name_label: "Name",
		name_placeholder: "Style name",
		new_style: "New style",
		number_label: "Number",
		panel_title: "Cell styles",
		section_custom: "Custom",
		section_theme: "Theme",
		style_properties: "Style properties",
		update_style: "Edit style",
		vertical_align_label: "Vertical"
	},
	navigation: {
		add_sheet: "Add sheet",
		sheet_list: "Sheet list"
	},
	num_fmt: {
		cancel: "Cancel",
		close: "Close dialog",
		save: "Save",
		title: "Custom number format"
	},
	regional_settings: {
		language: { display_language: {
			de: "Deutsch",
			en: "English",
			es: "Español",
			fr: "Français",
			it: "Italiano"
		} },
		locale: {
			delimiter_comma: "Comma",
			delimiter_semicolon: "Semicolon",
			locale_example1: "Number",
			locale_example2: "Date and Time",
			locale_example3: "Formula delimiter",
			locale_label: "Locale",
			title: "Locale"
		},
		open_regional_settings: "Open regional settings",
		timezone: {
			timezone_helper: "Modifying this setting will impact date- and time-related functions, including TODAY() and NOW().",
			timezone_label: "Timezone",
			title: "Timezone"
		},
		title: "Regional Settings"
	},
	right_drawer: {
		close: "Close",
		resize_drawer: "Resize drawer"
	},
	sheet_delete: {
		cancel: "Cancel",
		confirm: "Yes, delete sheet",
		message: "The sheet '{{sheetName}}' will be deleted.",
		title: "Are you sure?"
	},
	sheet_tab: {
		change_color: "Change Color",
		delete: "Delete",
		duplicate: "Duplicate",
		hide_sheet: "Hide sheet",
		move_left: "Move left",
		move_right: "Move right",
		open_menu: "Open sheet menu",
		rename: "Rename"
	},
	themes: {
		accent_color_label: "Accent {{n}}",
		apply: "Apply",
		back_to_list: "Back to list",
		bg_color_label: "Background",
		cancel: "Cancel",
		custom_theme_name: "Custom",
		customize_theme: "Customize theme",
		dark_color_label: "Dark",
		fol_hlink_color_label: "Followed hyperlink",
		hlink_color_label: "Hyperlink",
		light_color_label: "Light",
		manage_themes: "Manage themes",
		panel_title: "Themes",
		text_color_label: "Text"
	},
	toolbar: {
		add_link: "Insert link",
		align_center: "Align center",
		align_left: "Align left",
		align_right: "Align right",
		bold: "Bold",
		borders: {
			all: "All borders",
			bottom: "Bottom borders",
			clear: "Clear borders",
			color: "Border color",
			horizontal: "Horizontal borders",
			inner: "Inner borders",
			left: "Left borders",
			outer: "Outer borders",
			right: "Right borders",
			style: "Border style",
			title: "Borders",
			top: "Top borders",
			vertical: "Vertical borders"
		},
		clear_formatting: "Clear formatting",
		conditional_formatting: "Conditional formatting",
		copy_styles: "Copy styles",
		currency: "Format as currency",
		decimal_places_decrease: "Decrease decimal places",
		decimal_places_increase: "Increase decimal places",
		decrease_font_size: "Decrease font size",
		download_png: "Download as PNG",
		fill_color: "Fill color",
		font_color: "Font color",
		font_size: "Font size",
		format_menu: {
			auto: "Auto",
			currency_eur: "Euro (EUR)",
			currency_eur_example: "€",
			currency_gbp: "British Pound (GBP)",
			currency_gbp_example: "£",
			currency_usd: "Dollar (USD)",
			currency_usd_example: "$",
			custom: "Custom",
			date_long: "Long date",
			date_short: "Short date",
			number: "Number",
			percentage: "Percentage",
			percentage_example: "10%"
		},
		format_number: "Format number",
		increase_font_size: "Increase font size",
		italic: "Italic",
		merge_cells: "Merge cells",
		merge_menu: {
			merge: "Merge cells",
			merge_across: "Merge across",
			merge_center: "Merge & center",
			merge_down: "Merge down",
			unmerge: "Unmerge cells"
		},
		named_styles: "Cell styles",
		percentage: "Format as percentage",
		redo: "Redo",
		scroll_left: "Scroll left",
		scroll_right: "Scroll right",
		selected_png: "Export selected area as PNG",
		show_hide_grid_lines: "Show/hide grid lines",
		strike_through: "Strikethrough",
		themes: "Themes",
		underline: "Underline",
		undo: "Undo",
		vertical_align_bottom: "Align bottom",
		vertical_align_middle: "Align middle",
		vertical_align_top: "Align top",
		wrap_text: "Wrap text"
	}
}, gs = {
	"en-US": { translation: hs },
	"en-GB": { translation: hs },
	"es-ES": { translation: {
		color_picker: {
			add: "Añadir nuevo color",
			apply: "Añadir color",
			cancel: "Cancelar",
			default: "Predeterminado",
			no_fill: "Sin relleno",
			recent: "Recientes",
			standard_colors: "Colores estándar",
			themed_colors: "Colores del tema",
			title: "Selector de color"
		},
		common: {
			apply: "Aplicar",
			cancel: "Cancelar"
		},
		conditional_formatting: {
			add_new_rule: "Añadir una nueva regla",
			apply: "Aplicar cambios",
			apply_preset: "Aplicar estilo predefinido",
			apply_to: "Aplicar a",
			apply_to_placeholder: "ej. A1:B10",
			apply_to_range: "Rango",
			back_to_list: "Volver a la lista",
			cancel: "Cancelar",
			color_scale_maximum: "Máximo",
			color_scale_midpoint: "Punto medio",
			color_scale_minimum: "Mínimo",
			color_scale_settings: "Configuración",
			color_scale_type_formula: "Fórmula",
			color_scale_type_max: "Máx",
			color_scale_type_min: "Mín",
			color_scale_type_none: "Ninguno",
			color_scale_type_number: "Número",
			color_scale_type_percent: "Porcentaje",
			color_scale_type_percentile: "Percentil",
			data_bars_gradient_fill: "Relleno degradado",
			data_bars_maximum: "Máximo",
			data_bars_minimum: "Mínimo",
			data_bars_negative: "Negativo",
			data_bars_positive: "Positivo",
			data_bars_preferences: "Preferencias",
			data_bars_settings: "Configuración",
			data_bars_show_value: "Mostrar valor de celda",
			data_bars_solid_fill: "Relleno sólido",
			data_bars_type_automatic: "Automático",
			default_styles: "Presets",
			delete_rule: "Eliminar regla",
			desc_cell_value: "Valor de celda {{op}}",
			desc_cell_value_between: "Valor de celda entre {{value}} y {{value2}}",
			desc_cell_value_not_between: "Valor de celda no entre {{value}} y {{value2}}",
			desc_color_scale: "Escala de colores",
			desc_data_bars: "Barras de datos",
			desc_date: "Fecha {{op}}",
			desc_date_between: "Fecha entre {{value}} y {{value2}}",
			desc_date_not_between: "Fecha no entre {{value}} y {{value2}}",
			desc_formula: "Fórmula: {{value}}",
			desc_op_begins_with: "comienza con",
			desc_op_between: "entre",
			desc_op_contains: "contiene",
			desc_op_does_not_contain: "no contiene",
			desc_op_ends_with: "termina con",
			desc_op_equals: "es exactamente",
			desc_op_in_last_7_days: "en los últimos 7 días",
			desc_op_in_next_7_days: "en los próximos 7 días",
			desc_op_last_month: "en el mes pasado",
			desc_op_last_week: "en la semana pasada",
			desc_op_last_year: "en el año pasado",
			desc_op_next_month: "en el próximo mes",
			desc_op_next_week: "en la próxima semana",
			desc_op_next_year: "en el próximo año",
			desc_op_not_between: "no entre",
			desc_op_this_month: "en este mes",
			desc_op_this_week: "en esta semana",
			desc_op_this_year: "en este año",
			desc_op_today: "es hoy",
			desc_op_tomorrow: "es mañana",
			desc_op_yesterday: "es ayer",
			desc_text: "Texto {{op}}",
			desc_text_value: "Texto {{op}} '{{value}}'",
			duplicate_rule: "Duplicar regla",
			edit_rule: "Editar regla",
			empty_message1: "Aún no hay reglas de formato condicional.",
			empty_message2: "Haz clic en 'Añadir nuevo' para agregar una.",
			filter_label: "Ver",
			filter_selection: "Selección",
			filter_this_sheet: "Esta hoja",
			format_rules: "Reglas de formato",
			format_style: "Estilo de formato",
			formula_error_invalid: "Fórmula no válida",
			formula_error_must_start_with_equals: "La fórmula debe empezar con =",
			formula_placeholder: "ej. =A1>0",
			highlight_cells_if: "Resaltar celdas si...",
			icon_sets_else: "En caso contrario",
			icon_sets_icons: "iconos",
			icon_sets_mode_preset: "Conjuntos de iconos",
			icon_sets_ratings: "Valoraciones",
			icon_sets_settings: "Configuración",
			icon_sets_show_value: "Mostrar valor de celda",
			icon_sets_when_value_is: "Cuando el valor es",
			move_down: "Bajar prioridad",
			move_up: "Subir prioridad",
			new: "Añadir nuevo",
			no_search_results: "Ninguna regla coincide con tu búsqueda.",
			op_begins_with: "Comienza con",
			op_between: "Entre",
			op_contains: "Contiene",
			op_does_not_contain: "No contiene",
			op_does_not_equal: "Distinto de",
			op_ends_with: "Termina con",
			op_equals: "Igual a",
			op_greater_than: "Mayor que",
			op_greater_than_or_equal: "Mayor o igual que",
			op_in_last_7_days: "Últimos 7 días",
			op_in_next_7_days: "Próximos 7 días",
			op_last_month: "Mes pasado",
			op_last_week: "Semana pasada",
			op_last_year: "Año pasado",
			op_less_than: "Menor que",
			op_less_than_or_equal: "Menor o igual que",
			op_next_month: "Próximo mes",
			op_next_week: "Próxima semana",
			op_next_year: "Próximo año",
			op_not_between: "No entre",
			op_this_month: "Este mes",
			op_this_week: "Esta semana",
			op_this_year: "Este año",
			op_today: "Hoy",
			op_tomorrow: "Mañana",
			op_yesterday: "Ayer",
			rule_type_blanks: "Celdas vacías",
			rule_type_cell_value: "Valor de celda...",
			rule_type_date: "Fecha...",
			rule_type_duplicate_values: "Valores duplicados",
			rule_type_errors: "Errores",
			rule_type_formula: "Fórmula",
			rule_type_no_blanks: "Celdas no vacías",
			rule_type_no_errors: "Sin errores",
			rule_type_text: "Texto...",
			rule_type_unique_values: "Valores únicos",
			rule_value_placeholder: "Valor",
			search_placeholder: "Buscar...",
			stop_if_true: "Detener si es verdadero",
			tab_classic: "Valores",
			tab_color_scale: "Escalas",
			tab_data_bars: "Barras",
			tab_icon_sets: "Iconos",
			title: "Formato condicional",
			use_selection: "Usar rango seleccionado"
		},
		context_menu: {
			cell: {
				copy: "Copiar",
				cut: "Cortar",
				delete: "Eliminar...",
				delete_column: "Columna '{{column}}'",
				delete_row: "Fila '{{row}}'",
				insert: "Insertar...",
				insert_column_left: "Columna a la izquierda",
				insert_column_right: "Columna a la derecha",
				insert_row_above: "Fila encima",
				insert_row_below: "Fila debajo",
				paste: "Pegar"
			},
			column_header: {
				delete_column: "Eliminar la columna '{{column}}'",
				delete_columns: "Eliminar las columnas {{columnStart}} - {{columnEnd}}",
				freeze_columns: "Fijar hasta la columna '{{column}}'",
				hide_column: "Ocultar la columna '{{column}}'",
				hide_columns: "Ocultar las columnas {{columnStart}} - {{columnEnd}}",
				insert_columns_after: "Insertar {{count}} columna(s) a la derecha",
				insert_columns_before: "Insertar {{count}} columna(s) a la izquierda",
				move_columns_left: "Mover columnas a la izquierda",
				move_columns_right: "Mover columnas a la derecha",
				set_column_width: "Definir ancho de columna",
				show_hidden_columns: "Mostrar columnas ocultas",
				unfreeze_columns: "Quitar fijación de columnas"
			},
			row_header: {
				delete_row: "Eliminar la fila '{{row}}'",
				delete_rows: "Eliminar las filas {{rowStart}} - {{rowEnd}}",
				freeze_rows: "Fijar hasta la fila '{{row}}'",
				hide_row: "Ocultar la fila '{{row}}'",
				hide_rows: "Ocultar las filas {{rowStart}} - {{rowEnd}}",
				insert_rows_above: "Insertar {{count}} fila(s) encima",
				insert_rows_below: "Insertar {{count}} fila(s) debajo",
				move_rows_down: "Mover filas hacia abajo",
				move_rows_up: "Mover filas hacia arriba",
				set_row_height: "Definir alto de fila",
				show_hidden_rows: "Mostrar filas ocultas",
				unfreeze_rows: "Quitar fijación de filas"
			}
		},
		error_dialog: {
			error_autofill: "No se puede autorrellenar",
			error_autofill_array: "El área de relleno no puede cubrir parte de una fórmula matricial.",
			error_autofill_merged: "El área de relleno no puede cubrir parte de una celda combinada.",
			error_clipboard_paste: "Acceso al portapapeles denegado. Por favor, permite el acceso al portapapeles en tu navegador.",
			error_deleting_cells: "Error al eliminar las celdas",
			error_deleting_columns: "Error al eliminar las columnas",
			error_deleting_rows: "Error al eliminar las filas",
			error_editing_formula: "Error al editar la fórmula",
			error_inserting_columns: "Error al insertar las columnas",
			error_inserting_rows: "Error al insertar las filas",
			error_merging_cells: "No se pueden combinar las celdas",
			error_merging_cells_content: "Solo una celda de la selección puede tener contenido.",
			error_moving_columns: "Error al mover las columnas",
			error_moving_rows: "Error al mover las filas",
			error_paste: "No se puede pegar",
			error_paste_merged: "El área pegada no puede cubrir parte de una celda combinada."
		},
		formula_bar: { manage_named_ranges: "Gestionar rangos con nombre" },
		link_dialog: {
			body_placeholder: "Mensaje (opcional)",
			cell_reference_placeholder: "Referencia de celda",
			close: "Cerrar",
			delete: "Eliminar",
			document_tab: "Enlace al documento",
			email_placeholder: "Dirección de correo",
			email_tab: "Correo",
			external_tab: "Enlace externo",
			invalid_email: "Introduce una dirección de correo válida",
			invalid_reference: "Introduce una referencia de celda válida",
			invalid_url: "Introduce una URL válida",
			label_placeholder: "Etiqueta",
			save: "Guardar",
			subject_placeholder: "Asunto (opcional)",
			title_add: "Añadir enlace",
			title_edit: "Editar enlace",
			tooltip_placeholder: "Descripción emergente (opcional)",
			url_placeholder: "URL"
		},
		link_tooltip: {
			break: "Quitar enlace",
			copy: "Copiar enlace",
			edit: "Editar enlace"
		},
		name_manager_dialog: {
			add_new_range: "Añadir un nuevo rango",
			apply: "Aplicar cambios",
			back_to_list: "Volver a la lista",
			cancel: "Cancelar",
			default_range_prefix: "Rango",
			delete: "Eliminar rango",
			edit: "Editar rango",
			edit_range: "Editar rango",
			empty_message1: "Aún no se han añadido rangos con nombre.",
			empty_message2: "Haz clic en 'Añadir nuevo' para agregar uno.",
			enter_formula: "Introduce la fórmula",
			enter_range_name: "Introduce el nombre del rango",
			global: "(Global)",
			new: "Añadir nuevo",
			new_named_range: "Nuevo rango con nombre",
			no_search_results: "Ningún rango con nombre coincide con tu búsqueda.",
			range_name: "Nombre del rango",
			refers_to: "Hace referencia a",
			scope_filter_all: "Todo",
			scope_filter_current: "Hoja actual",
			scope_filter_global: "Global",
			scope_helper: "El ámbito del rango con nombre determina dónde está disponible.",
			scope_label: "Ámbito",
			search_placeholder: "Buscar...",
			title: "Rangos con nombre",
			use_selection: "Usar rango seleccionado",
			workbook: "Libro"
		},
		named_styles: {
			accent_1: "Acento 1",
			accent_2: "Acento 2",
			accent_3: "Acento 3",
			accent_4: "Acento 4",
			accent_5: "Acento 5",
			accent_6: "Acento 6",
			add_new_style: "Añadir nuevo",
			alignment_label: "Alineación",
			apply: "Aplicar",
			back_to_list: "Volver a la lista",
			background_color_label: "Color de fondo",
			border_label: "Borde",
			cancel: "Cancelar",
			category_data_and_model: "Datos y modelo",
			category_good_bad_neutral: "Bueno, malo y neutral",
			category_number_format: "Formato de número",
			category_themed_cell_styles: "Estilos de celda con tema",
			category_titles_and_headings: "Títulos y encabezados",
			custom_format_placeholder: "p.ej. #,##0.00 o \"€\"#,##0",
			custom_format_required: "El formato personalizado no puede estar vacío",
			default_name_prefix: "Estilo",
			delete_style: "Eliminar estilo",
			empty_message1: "No hay estilos personalizados.",
			empty_message2: "Haz clic en 'Añadir nuevo' para crear uno.",
			fill_label: "Relleno",
			font_label: "Fuente",
			font_style_label: "Estilo",
			format_label: "Formato",
			horizontal_align_label: "Horizontal",
			line_style_label: "Estilo de línea",
			manage_styles: "Gestionar estilos",
			name_already_exists: "Ya existe un estilo con este nombre",
			name_label: "Nombre",
			name_placeholder: "Nombre del estilo",
			new_style: "Nuevo estilo",
			number_label: "Número",
			panel_title: "Estilos de celda",
			section_custom: "Personalizado",
			section_theme: "Tema",
			style_properties: "Propiedades del estilo",
			update_style: "Editar estilo",
			vertical_align_label: "Vertical"
		},
		navigation: {
			add_sheet: "Añadir hoja",
			sheet_list: "Lista de hojas"
		},
		num_fmt: {
			cancel: "Cancelar",
			close: "Cerrar diálogo",
			save: "Guardar",
			title: "Formato de número personalizado"
		},
		regional_settings: {
			language: { display_language: {
				de: "Deutsch",
				en: "English",
				es: "Español",
				fr: "Français",
				it: "Italiano"
			} },
			locale: {
				delimiter_comma: "Coma",
				delimiter_semicolon: "Punto y coma",
				locale_example1: "Número",
				locale_example2: "Fecha y hora",
				locale_example3: "Delimitador de fórmulas",
				locale_label: "Configuración regional",
				title: "Configuración regional"
			},
			open_regional_settings: "Abrir configuración regional",
			timezone: {
				timezone_helper: "Modificar esta configuración afectará a las funciones relacionadas con fecha y hora, incluyendo HOY() y AHORA().",
				timezone_label: "Zona horaria",
				title: "Zona horaria"
			},
			title: "Configuración regional"
		},
		right_drawer: {
			close: "Cerrar",
			resize_drawer: "Cambiar tamaño del panel"
		},
		sheet_delete: {
			cancel: "Cancelar",
			confirm: "Sí, eliminar hoja",
			message: "La hoja '{{sheetName}}' será eliminada.",
			title: "¿Estás seguro?"
		},
		sheet_tab: {
			change_color: "Cambiar color",
			delete: "Eliminar",
			duplicate: "Duplicar",
			hide_sheet: "Ocultar hoja",
			move_left: "Mover a la izquierda",
			move_right: "Mover a la derecha",
			open_menu: "Abrir menú de hoja",
			rename: "Renombrar"
		},
		themes: {
			accent_color_label: "Acento {{n}}",
			apply: "Aplicar",
			back_to_list: "Volver a la lista",
			bg_color_label: "Fondo",
			cancel: "Cancelar",
			custom_theme_name: "Personalizado",
			customize_theme: "Personalizar tema",
			dark_color_label: "Oscuro",
			fol_hlink_color_label: "Hipervínculo visitado",
			hlink_color_label: "Hipervínculo",
			light_color_label: "Claro",
			manage_themes: "Administrar temas",
			panel_title: "Temas",
			text_color_label: "Texto"
		},
		toolbar: {
			add_link: "Insertar enlace",
			align_center: "Alinear al centro",
			align_left: "Alinear a la izquierda",
			align_right: "Alinear a la derecha",
			bold: "Negrita",
			borders: {
				all: "Todos los bordes",
				bottom: "Bordes inferiores",
				clear: "Quitar bordes",
				color: "Color del borde",
				horizontal: "Bordes horizontales",
				inner: "Bordes internos",
				left: "Bordes izquierdos",
				outer: "Bordes externos",
				right: "Bordes derechos",
				style: "Estilo del borde",
				title: "Bordes",
				top: "Bordes superiores",
				vertical: "Bordes verticales"
			},
			clear_formatting: "Borrar formato",
			conditional_formatting: "Formato condicional",
			copy_styles: "Copiar estilos",
			currency: "Formato moneda",
			decimal_places_decrease: "Disminuir decimales",
			decimal_places_increase: "Aumentar decimales",
			decrease_font_size: "Disminuir tamaño de fuente",
			download_png: "Descargar como PNG",
			fill_color: "Color de relleno",
			font_color: "Color de fuente",
			font_size: "Tamaño de fuente",
			format_menu: {
				auto: "Automático",
				currency_eur: "Euro (EUR)",
				currency_eur_example: "€",
				currency_gbp: "Libra esterlina (GBP)",
				currency_gbp_example: "£",
				currency_usd: "Dólar (USD)",
				currency_usd_example: "$",
				custom: "Personalizado",
				date_long: "Fecha larga",
				date_short: "Fecha corta",
				number: "Número",
				percentage: "Porcentaje",
				percentage_example: "10%"
			},
			format_number: "Formato de número",
			increase_font_size: "Aumentar tamaño de fuente",
			italic: "Cursiva",
			merge_cells: "Combinar celdas",
			merge_menu: {
				merge: "Combinar celdas",
				merge_across: "Combinar horizontalmente",
				merge_center: "Combinar y centrar",
				merge_down: "Combinar verticalmente",
				unmerge: "Separar celdas"
			},
			named_styles: "Estilos de celda",
			percentage: "Formato porcentaje",
			redo: "Rehacer",
			scroll_left: "Desplazar a la izquierda",
			scroll_right: "Desplazar a la derecha",
			selected_png: "Exportar área seleccionada como PNG",
			show_hide_grid_lines: "Mostrar/ocultar líneas de cuadrícula",
			strike_through: "Tachado",
			themes: "Temas",
			underline: "Subrayado",
			undo: "Deshacer",
			vertical_align_bottom: "Alinear abajo",
			vertical_align_middle: "Alinear al medio",
			vertical_align_top: "Alinear arriba",
			wrap_text: "Ajustar texto"
		}
	} },
	"fr-FR": { translation: {
		color_picker: {
			add: "Ajouter une nouvelle couleur",
			apply: "Ajouter la couleur",
			cancel: "Annuler",
			default: "Par défaut",
			no_fill: "Sans remplissage",
			recent: "Récentes",
			standard_colors: "Couleurs standard",
			themed_colors: "Couleurs du thème",
			title: "Sélecteur de couleur"
		},
		common: {
			apply: "Appliquer",
			cancel: "Annuler"
		},
		conditional_formatting: {
			add_new_rule: "Ajouter une nouvelle règle",
			apply: "Appliquer les modifications",
			apply_preset: "Appliquer un style prédéfini",
			apply_to: "Appliquer à",
			apply_to_placeholder: "ex. A1:B10",
			apply_to_range: "Plage",
			back_to_list: "Retour à la liste",
			cancel: "Annuler",
			color_scale_maximum: "Maximum",
			color_scale_midpoint: "Point médian",
			color_scale_minimum: "Minimum",
			color_scale_settings: "Paramètres",
			color_scale_type_formula: "Formule",
			color_scale_type_max: "Max",
			color_scale_type_min: "Min",
			color_scale_type_none: "Aucun",
			color_scale_type_number: "Nombre",
			color_scale_type_percent: "Pourcentage",
			color_scale_type_percentile: "Centile",
			data_bars_gradient_fill: "Remplissage dégradé",
			data_bars_maximum: "Maximum",
			data_bars_minimum: "Minimum",
			data_bars_negative: "Négatif",
			data_bars_positive: "Positif",
			data_bars_preferences: "Préférences",
			data_bars_settings: "Paramètres",
			data_bars_show_value: "Afficher la valeur de la cellule",
			data_bars_solid_fill: "Remplissage uni",
			data_bars_type_automatic: "Automatique",
			default_styles: "Préréglages",
			delete_rule: "Supprimer la règle",
			desc_cell_value: "Valeur de la cellule {{op}}",
			desc_cell_value_between: "Valeur de la cellule entre {{value}} et {{value2}}",
			desc_cell_value_not_between: "Valeur de la cellule pas entre {{value}} et {{value2}}",
			desc_color_scale: "Échelle de couleurs",
			desc_data_bars: "Barres de données",
			desc_date: "Date {{op}}",
			desc_date_between: "Date entre {{value}} et {{value2}}",
			desc_date_not_between: "Date pas entre {{value}} et {{value2}}",
			desc_formula: "Formule : {{value}}",
			desc_op_begins_with: "commence par",
			desc_op_between: "entre",
			desc_op_contains: "contient",
			desc_op_does_not_contain: "ne contient pas",
			desc_op_ends_with: "se termine par",
			desc_op_equals: "est exactement",
			desc_op_in_last_7_days: "dans les 7 derniers jours",
			desc_op_in_next_7_days: "dans les 7 prochains jours",
			desc_op_last_month: "le mois dernier",
			desc_op_last_week: "la semaine dernière",
			desc_op_last_year: "l'année dernière",
			desc_op_next_month: "le mois prochain",
			desc_op_next_week: "la semaine prochaine",
			desc_op_next_year: "l'année prochaine",
			desc_op_not_between: "pas entre",
			desc_op_this_month: "ce mois-ci",
			desc_op_this_week: "cette semaine",
			desc_op_this_year: "cette année",
			desc_op_today: "est aujourd'hui",
			desc_op_tomorrow: "est demain",
			desc_op_yesterday: "est hier",
			desc_text: "Texte {{op}}",
			desc_text_value: "Texte {{op}} '{{value}}'",
			duplicate_rule: "Dupliquer la règle",
			edit_rule: "Modifier la règle",
			empty_message1: "Aucune règle de mise en forme conditionnelle.",
			empty_message2: "Cliquez sur « Ajouter » pour en créer une.",
			filter_label: "Voir",
			filter_selection: "Sélection",
			filter_this_sheet: "Cette feuille",
			format_rules: "Règles de mise en forme",
			format_style: "Style de mise en forme",
			formula_error_invalid: "Formule invalide",
			formula_error_must_start_with_equals: "La formule doit commencer par =",
			formula_placeholder: "ex. =A1>0",
			highlight_cells_if: "Mettre en surbrillance si...",
			icon_sets_else: "Sinon",
			icon_sets_icons: "icônes",
			icon_sets_mode_preset: "Jeux d'icônes",
			icon_sets_ratings: "Évaluations",
			icon_sets_settings: "Paramètres",
			icon_sets_show_value: "Afficher la valeur de la cellule",
			icon_sets_when_value_is: "Quand la valeur est",
			move_down: "Baisser la priorité",
			move_up: "Augmenter la priorité",
			new: "Ajouter",
			no_search_results: "Aucune règle ne correspond à votre recherche.",
			op_begins_with: "Commence par",
			op_between: "Entre",
			op_contains: "Contient",
			op_does_not_contain: "Ne contient pas",
			op_does_not_equal: "Différent de",
			op_ends_with: "Se termine par",
			op_equals: "Égal à",
			op_greater_than: "Supérieur à",
			op_greater_than_or_equal: "Supérieur ou égal à",
			op_in_last_7_days: "7 derniers jours",
			op_in_next_7_days: "7 prochains jours",
			op_last_month: "Mois dernier",
			op_last_week: "Semaine dernière",
			op_last_year: "L'année dernière",
			op_less_than: "Inférieur à",
			op_less_than_or_equal: "Inférieur ou égal à",
			op_next_month: "Mois prochain",
			op_next_week: "Semaine prochaine",
			op_next_year: "L'année prochaine",
			op_not_between: "Pas entre",
			op_this_month: "Ce mois-ci",
			op_this_week: "Cette semaine",
			op_this_year: "Cette année",
			op_today: "Aujourd'hui",
			op_tomorrow: "Demain",
			op_yesterday: "Hier",
			rule_type_blanks: "Cellules vides",
			rule_type_cell_value: "Valeur de la cellule...",
			rule_type_date: "Date...",
			rule_type_duplicate_values: "Valeurs en double",
			rule_type_errors: "Erreurs",
			rule_type_formula: "Formule",
			rule_type_no_blanks: "Cellules non vides",
			rule_type_no_errors: "Sans erreurs",
			rule_type_text: "Texte...",
			rule_type_unique_values: "Valeurs uniques",
			rule_value_placeholder: "Valeur",
			search_placeholder: "Rechercher...",
			stop_if_true: "Arrêter si vrai",
			tab_classic: "Valeurs",
			tab_color_scale: "Nuances",
			tab_data_bars: "Barres",
			tab_icon_sets: "Icônes",
			title: "Mise en forme conditionnelle",
			use_selection: "Utiliser la plage sélectionnée"
		},
		context_menu: {
			cell: {
				copy: "Copier",
				cut: "Couper",
				delete: "Supprimer...",
				delete_column: "Colonne '{{column}}'",
				delete_row: "Ligne '{{row}}'",
				insert: "Insérer...",
				insert_column_left: "Colonne à gauche",
				insert_column_right: "Colonne à droite",
				insert_row_above: "Ligne au-dessus",
				insert_row_below: "Ligne en-dessous",
				paste: "Coller"
			},
			column_header: {
				delete_column: "Supprimer la colonne '{{column}}'",
				delete_columns: "Supprimer les colonnes {{columnStart}} - {{columnEnd}}",
				freeze_columns: "Figer jusqu’à la colonne '{{column}}'",
				hide_column: "Masquer la colonne '{{column}}'",
				hide_columns: "Masquer les colonnes {{columnStart}} - {{columnEnd}}",
				insert_columns_after: "Insérer {{count}} colonne(s) à droite",
				insert_columns_before: "Insérer {{count}} colonne(s) à gauche",
				move_columns_left: "Déplacer les colonnes vers la gauche",
				move_columns_right: "Déplacer les colonnes vers la droite",
				set_column_width: "Définir la largeur de colonne",
				show_hidden_columns: "Afficher les colonnes masquées",
				unfreeze_columns: "Annuler le figeage des colonnes"
			},
			row_header: {
				delete_row: "Supprimer la ligne '{{row}}'",
				delete_rows: "Supprimer les lignes {{rowStart}} - {{rowEnd}}",
				freeze_rows: "Figer jusqu’à la ligne '{{row}}'",
				hide_row: "Masquer la ligne '{{row}}'",
				hide_rows: "Masquer les lignes {{rowStart}} - {{rowEnd}}",
				insert_rows_above: "Insérer {{count}} ligne(s) au-dessus",
				insert_rows_below: "Insérer {{count}} ligne(s) en dessous",
				move_rows_down: "Déplacer les lignes vers le bas",
				move_rows_up: "Déplacer les lignes vers le haut",
				set_row_height: "Définir la hauteur de ligne",
				show_hidden_rows: "Afficher les lignes masquées",
				unfreeze_rows: "Annuler le figeage des lignes"
			}
		},
		error_dialog: {
			error_autofill: "Recopie impossible",
			error_autofill_array: "La zone de recopie ne peut pas couvrir une partie d'une formule matricielle.",
			error_autofill_merged: "La zone de recopie ne peut pas couvrir une partie d'une cellule fusionnée.",
			error_clipboard_paste: "Accès au presse-papiers refusé. Veuillez autoriser les permissions du presse-papiers dans votre navigateur.",
			error_deleting_cells: "Échec de la suppression des cellules",
			error_deleting_columns: "Échec de la suppression des colonnes",
			error_deleting_rows: "Échec de la suppression des lignes",
			error_editing_formula: "Erreur lors de la modification de la formule",
			error_inserting_columns: "Échec de l'insertion des colonnes",
			error_inserting_rows: "Échec de l'insertion des lignes",
			error_merging_cells: "Impossible de fusionner les cellules",
			error_merging_cells_content: "Une seule cellule de la sélection peut avoir du contenu.",
			error_moving_columns: "Échec du déplacement des colonnes",
			error_moving_rows: "Échec du déplacement des lignes",
			error_paste: "Collage impossible",
			error_paste_merged: "La zone collée ne peut pas couvrir une partie d'une cellule fusionnée."
		},
		formula_bar: { manage_named_ranges: "Gérer les plages nommées" },
		link_dialog: {
			body_placeholder: "Message (facultatif)",
			cell_reference_placeholder: "Référence de cellule",
			close: "Fermer",
			delete: "Supprimer",
			document_tab: "Lien vers le document",
			email_placeholder: "Adresse e-mail",
			email_tab: "E-mail",
			external_tab: "Lien externe",
			invalid_email: "Veuillez saisir une adresse e-mail valide",
			invalid_reference: "Veuillez saisir une référence de cellule valide",
			invalid_url: "Veuillez saisir une URL valide",
			label_placeholder: "Libellé",
			save: "Enregistrer",
			subject_placeholder: "Objet (facultatif)",
			title_add: "Ajouter un lien",
			title_edit: "Modifier le lien",
			tooltip_placeholder: "Info-bulle (facultatif)",
			url_placeholder: "URL"
		},
		link_tooltip: {
			break: "Supprimer le lien",
			copy: "Copier le lien",
			edit: "Modifier le lien"
		},
		name_manager_dialog: {
			add_new_range: "Ajouter une nouvelle plage",
			apply: "Appliquer les modifications",
			back_to_list: "Retour à la liste",
			cancel: "Annuler",
			default_range_prefix: "Plage",
			delete: "Supprimer la plage",
			edit: "Modifier la plage",
			edit_range: "Modifier la plage",
			empty_message1: "Aucune plage nommée n’a encore été ajoutée.",
			empty_message2: "Cliquez sur « Ajouter » pour en créer une.",
			enter_formula: "Saisir la formule",
			enter_range_name: "Saisir le nom de la plage",
			global: "(Global)",
			new: "Ajouter",
			new_named_range: "Nouvelle plage nommée",
			no_search_results: "Aucune plage nommée ne correspond à votre recherche.",
			range_name: "Nom de la plage",
			refers_to: "Fait référence à",
			scope_filter_all: "Tous",
			scope_filter_current: "Feuille actuelle",
			scope_filter_global: "Global",
			scope_helper: "La portée de la plage nommée détermine où elle est disponible.",
			scope_label: "Portée",
			search_placeholder: "Rechercher...",
			title: "Plages nommées",
			use_selection: "Utiliser la plage sélectionnée",
			workbook: "Classeur"
		},
		named_styles: {
			accent_1: "Accentuation 1",
			accent_2: "Accentuation 2",
			accent_3: "Accentuation 3",
			accent_4: "Accentuation 4",
			accent_5: "Accentuation 5",
			accent_6: "Accentuation 6",
			add_new_style: "Ajouter",
			alignment_label: "Alignement",
			apply: "Appliquer",
			back_to_list: "Retour à la liste",
			background_color_label: "Couleur d'arrière-plan",
			border_label: "Bordure",
			cancel: "Annuler",
			category_data_and_model: "Données et modèle",
			category_good_bad_neutral: "Bon, mauvais et neutre",
			category_number_format: "Format de nombre",
			category_themed_cell_styles: "Styles de cellule à thème",
			category_titles_and_headings: "Titres et en-têtes",
			custom_format_placeholder: "ex. #,##0.00 ou \"€\"#,##0",
			custom_format_required: "Le format personnalisé ne peut pas être vide",
			default_name_prefix: "Style",
			delete_style: "Supprimer le style",
			empty_message1: "Aucun style personnalisé.",
			empty_message2: "Cliquez sur 'Ajouter' pour en créer un.",
			fill_label: "Remplissage",
			font_label: "Police",
			font_style_label: "Style",
			format_label: "Format",
			horizontal_align_label: "Horizontal",
			line_style_label: "Style de ligne",
			manage_styles: "Gérer les styles",
			name_already_exists: "Un style avec ce nom existe déjà",
			name_label: "Nom",
			name_placeholder: "Nom du style",
			new_style: "Nouveau style",
			number_label: "Nombre",
			panel_title: "Styles de cellule",
			section_custom: "Personnalisé",
			section_theme: "Thème",
			style_properties: "Propriétés du style",
			update_style: "Modifier le style",
			vertical_align_label: "Vertical"
		},
		navigation: {
			add_sheet: "Ajouter une feuille",
			sheet_list: "Liste des feuilles"
		},
		num_fmt: {
			cancel: "Annuler",
			close: "Fermer la boîte de dialogue",
			save: "Enregistrer",
			title: "Format de nombre personnalisé"
		},
		regional_settings: {
			language: { display_language: {
				de: "Deutsch",
				en: "English",
				es: "Español",
				fr: "Français",
				it: "Italiano"
			} },
			locale: {
				delimiter_comma: "Virgule",
				delimiter_semicolon: "Point-virgule",
				locale_example1: "Nombre",
				locale_example2: "Date et heure",
				locale_example3: "Délimiteur de formule",
				locale_label: "Paramètres régionaux",
				title: "Paramètres régionaux"
			},
			open_regional_settings: "Ouvrir les paramètres régionaux",
			timezone: {
				timezone_helper: "Modifier ce paramètre aura un impact sur les fonctions liées à la date et à l’heure, y compris AUJOURDHUI() et MAINTENANT().",
				timezone_label: "Fuseau horaire",
				title: "Fuseau horaire"
			},
			title: "Paramètres régionaux"
		},
		right_drawer: {
			close: "Fermer",
			resize_drawer: "Redimensionner le panneau"
		},
		sheet_delete: {
			cancel: "Annuler",
			confirm: "Oui, supprimer la feuille",
			message: "La feuille « {{sheetName}} » sera supprimée.",
			title: "Êtes-vous sûr ?"
		},
		sheet_tab: {
			change_color: "Changer la couleur",
			delete: "Supprimer",
			duplicate: "Dupliquer",
			hide_sheet: "Masquer la feuille",
			move_left: "Déplacer à gauche",
			move_right: "Déplacer à droite",
			open_menu: "Ouvrir le menu de la feuille",
			rename: "Renommer"
		},
		themes: {
			accent_color_label: "Accent {{n}}",
			apply: "Appliquer",
			back_to_list: "Retour à la liste",
			bg_color_label: "Arrière-plan",
			cancel: "Annuler",
			custom_theme_name: "Personnalisé",
			customize_theme: "Personnaliser le thème",
			dark_color_label: "Sombre",
			fol_hlink_color_label: "Lien hypertexte visité",
			hlink_color_label: "Lien hypertexte",
			light_color_label: "Clair",
			manage_themes: "Gérer les thèmes",
			panel_title: "Thèmes",
			text_color_label: "Texte"
		},
		toolbar: {
			add_link: "Insérer un lien",
			align_center: "Centrer",
			align_left: "Aligner à gauche",
			align_right: "Aligner à droite",
			bold: "Gras",
			borders: {
				all: "Toutes les bordures",
				bottom: "Bordures inférieures",
				clear: "Supprimer les bordures",
				color: "Couleur de bordure",
				horizontal: "Bordures horizontales",
				inner: "Bordures intérieures",
				left: "Bordures gauches",
				outer: "Bordures extérieures",
				right: "Bordures droites",
				style: "Style de bordure",
				title: "Bordures",
				top: "Bordures supérieures",
				vertical: "Bordures verticales"
			},
			clear_formatting: "Effacer la mise en forme",
			conditional_formatting: "Mise en forme conditionnelle",
			copy_styles: "Copier les styles",
			currency: "Formater monnaie",
			decimal_places_decrease: "Diminuer les décimales",
			decimal_places_increase: "Augmenter les décimales",
			decrease_font_size: "Diminuer la taille de la police",
			download_png: "Télécharger en PNG",
			fill_color: "Couleur de remplissage",
			font_color: "Couleur de police",
			font_size: "Taille de la police",
			format_menu: {
				auto: "Automatique",
				currency_eur: "Euro (EUR)",
				currency_eur_example: "€",
				currency_gbp: "Livre sterling (GBP)",
				currency_gbp_example: "£",
				currency_usd: "Dollar (USD)",
				currency_usd_example: "$",
				custom: "Personnalisé",
				date_long: "Date longue",
				date_short: "Date courte",
				number: "Nombre",
				percentage: "Pourcentage",
				percentage_example: "10 %"
			},
			format_number: "Format de nombre",
			increase_font_size: "Augmenter la taille de la police",
			italic: "Italique",
			merge_cells: "Fusionner les cellules",
			merge_menu: {
				merge: "Fusionner les cellules",
				merge_across: "Fusionner horizontalement",
				merge_center: "Fusionner et centrer",
				merge_down: "Fusionner verticalement",
				unmerge: "Annuler la fusion"
			},
			named_styles: "Styles de cellule",
			percentage: "Formater pourcentage",
			redo: "Rétablir",
			scroll_left: "Faire défiler vers la gauche",
			scroll_right: "Faire défiler vers la droite",
			selected_png: "Exporter la zone sélectionnée en PNG",
			show_hide_grid_lines: "Afficher/masquer le quadrillage",
			strike_through: "Barré",
			themes: "Thèmes",
			underline: "Souligné",
			undo: "Annuler",
			vertical_align_bottom: "Aligner en bas",
			vertical_align_middle: "Aligner au milieu",
			vertical_align_top: "Aligner en haut",
			wrap_text: "Renvoyer à la ligne"
		}
	} },
	"de-DE": { translation: ms },
	"it-IT": { translation: {
		color_picker: {
			add: "Aggiungi nuovo colore",
			apply: "Aggiungi colore",
			cancel: "Annulla",
			default: "Predefinito",
			no_fill: "Nessun riempimento",
			recent: "Recenti",
			standard_colors: "Colori standard",
			themed_colors: "Colori del tema",
			title: "Selettore di colore"
		},
		common: {
			apply: "Applica",
			cancel: "Annulla"
		},
		conditional_formatting: {
			add_new_rule: "Aggiungi una nuova regola",
			apply: "Applica modifiche",
			apply_preset: "Applica stile predefinito",
			apply_to: "Applica a",
			apply_to_placeholder: "es. A1:B10",
			apply_to_range: "Intervallo",
			back_to_list: "Torna alla lista",
			cancel: "Annulla",
			color_scale_maximum: "Massimo",
			color_scale_midpoint: "Punto medio",
			color_scale_minimum: "Minimo",
			color_scale_settings: "Impostazioni",
			color_scale_type_formula: "Formula",
			color_scale_type_max: "Max",
			color_scale_type_min: "Min",
			color_scale_type_none: "Nessuno",
			color_scale_type_number: "Numero",
			color_scale_type_percent: "Percentuale",
			color_scale_type_percentile: "Percentile",
			data_bars_gradient_fill: "Riempimento sfumato",
			data_bars_maximum: "Massimo",
			data_bars_minimum: "Minimo",
			data_bars_negative: "Negativo",
			data_bars_positive: "Positivo",
			data_bars_preferences: "Preferenze",
			data_bars_settings: "Impostazioni",
			data_bars_show_value: "Mostra valore cella",
			data_bars_solid_fill: "Riempimento uniforme",
			data_bars_type_automatic: "Automatico",
			default_styles: "Preset",
			delete_rule: "Elimina regola",
			desc_cell_value: "Valore cella {{op}}",
			desc_cell_value_between: "Valore cella tra {{value}} e {{value2}}",
			desc_cell_value_not_between: "Valore cella non tra {{value}} e {{value2}}",
			desc_color_scale: "Scala di colori",
			desc_data_bars: "Barre dei dati",
			desc_date: "Data {{op}}",
			desc_date_between: "Data tra {{value}} e {{value2}}",
			desc_date_not_between: "Data non tra {{value}} e {{value2}}",
			desc_formula: "Formula: {{value}}",
			desc_op_begins_with: "inizia con",
			desc_op_between: "tra",
			desc_op_contains: "contiene",
			desc_op_does_not_contain: "non contiene",
			desc_op_ends_with: "termina con",
			desc_op_equals: "è esattamente",
			desc_op_in_last_7_days: "negli ultimi 7 giorni",
			desc_op_in_next_7_days: "nei prossimi 7 giorni",
			desc_op_last_month: "nel mese scorso",
			desc_op_last_week: "nella settimana scorsa",
			desc_op_last_year: "nell'anno scorso",
			desc_op_next_month: "nel prossimo mese",
			desc_op_next_week: "nella prossima settimana",
			desc_op_next_year: "nel prossimo anno",
			desc_op_not_between: "non tra",
			desc_op_this_month: "in questo mese",
			desc_op_this_week: "in questa settimana",
			desc_op_this_year: "in quest'anno",
			desc_op_today: "è oggi",
			desc_op_tomorrow: "è domani",
			desc_op_yesterday: "è ieri",
			desc_text: "Testo {{op}}",
			desc_text_value: "Testo {{op}} '{{value}}'",
			duplicate_rule: "Duplica regola",
			edit_rule: "Modifica regola",
			empty_message1: "Nessuna regola di formattazione condizionale.",
			empty_message2: "Fai clic su \"Aggiungi nuovo\" per crearne una.",
			filter_label: "Mostra",
			filter_selection: "Selezione",
			filter_this_sheet: "Questo foglio",
			format_rules: "Regole di formattazione",
			format_style: "Stile di formattazione",
			formula_error_invalid: "Formula non valida",
			formula_error_must_start_with_equals: "La formula deve iniziare con =",
			formula_placeholder: "es. =A1>0",
			highlight_cells_if: "Evidenzia celle se...",
			icon_sets_else: "Altrimenti",
			icon_sets_icons: "icone",
			icon_sets_mode_preset: "Set di icone",
			icon_sets_ratings: "Valutazioni",
			icon_sets_settings: "Impostazioni",
			icon_sets_show_value: "Mostra valore cella",
			icon_sets_when_value_is: "Quando il valore è",
			move_down: "Abbassa priorità",
			move_up: "Alza priorità",
			new: "Aggiungi nuovo",
			no_search_results: "Nessuna regola corrisponde alla tua ricerca.",
			op_begins_with: "Inizia con",
			op_between: "Tra",
			op_contains: "Contiene",
			op_does_not_contain: "Non contiene",
			op_does_not_equal: "Diverso da",
			op_ends_with: "Termina con",
			op_equals: "Uguale a",
			op_greater_than: "Maggiore di",
			op_greater_than_or_equal: "Maggiore o uguale a",
			op_in_last_7_days: "Ultimi 7 giorni",
			op_in_next_7_days: "Prossimi 7 giorni",
			op_last_month: "Mese scorso",
			op_last_week: "Settimana scorsa",
			op_last_year: "Anno scorso",
			op_less_than: "Minore di",
			op_less_than_or_equal: "Minore o uguale a",
			op_next_month: "Prossimo mese",
			op_next_week: "Prossima settimana",
			op_next_year: "Prossimo anno",
			op_not_between: "Non tra",
			op_this_month: "Questo mese",
			op_this_week: "Questa settimana",
			op_this_year: "Quest'anno",
			op_today: "Oggi",
			op_tomorrow: "Domani",
			op_yesterday: "Ieri",
			rule_type_blanks: "Celle vuote",
			rule_type_cell_value: "Valore cella...",
			rule_type_date: "Data...",
			rule_type_duplicate_values: "Valori duplicati",
			rule_type_errors: "Errori",
			rule_type_formula: "Formula",
			rule_type_no_blanks: "Celle non vuote",
			rule_type_no_errors: "Nessun errore",
			rule_type_text: "Testo...",
			rule_type_unique_values: "Valori univoci",
			rule_value_placeholder: "Valore",
			search_placeholder: "Cerca...",
			stop_if_true: "Interrompi se vero",
			tab_classic: "Valori",
			tab_color_scale: "Scale",
			tab_data_bars: "Barre",
			tab_icon_sets: "Icone",
			title: "Formattazione condizionale",
			use_selection: "Usa intervallo selezionato"
		},
		context_menu: {
			cell: {
				copy: "Copia",
				cut: "Taglia",
				delete: "Elimina...",
				delete_column: "Colonna '{{column}}'",
				delete_row: "Riga '{{row}}'",
				insert: "Inserisci...",
				insert_column_left: "Colonna a sinistra",
				insert_column_right: "Colonna a destra",
				insert_row_above: "Riga sopra",
				insert_row_below: "Riga sotto",
				paste: "Incolla"
			},
			column_header: {
				delete_column: "Elimina la colonna '{{column}}'",
				delete_columns: "Elimina le colonne {{columnStart}} - {{columnEnd}}",
				freeze_columns: "Blocca fino alla colonna '{{column}}'",
				hide_column: "Nascondi la colonna '{{column}}'",
				hide_columns: "Nascondi le colonne {{columnStart}} - {{columnEnd}}",
				insert_columns_after: "Inserisci {{count}} colonna(e) a destra",
				insert_columns_before: "Inserisci {{count}} colonna(e) a sinistra",
				move_columns_left: "Sposta le colonne a sinistra",
				move_columns_right: "Sposta le colonne a destra",
				set_column_width: "Imposta larghezza colonna",
				show_hidden_columns: "Mostra colonne nascoste",
				unfreeze_columns: "Rimuovi blocco delle colonne"
			},
			row_header: {
				delete_row: "Elimina la riga '{{row}}'",
				delete_rows: "Elimina le righe {{rowStart}} - {{rowEnd}}",
				freeze_rows: "Blocca fino alla riga '{{row}}'",
				hide_row: "Nascondi la riga '{{row}}'",
				hide_rows: "Nascondi le righe {{rowStart}} - {{rowEnd}}",
				insert_rows_above: "Inserisci {{count}} riga(e) sopra",
				insert_rows_below: "Inserisci {{count}} riga(e) sotto",
				move_rows_down: "Sposta le righe verso il basso",
				move_rows_up: "Sposta le righe verso l’alto",
				set_row_height: "Imposta altezza riga",
				show_hidden_rows: "Mostra righe nascoste",
				unfreeze_rows: "Rimuovi blocco delle righe"
			}
		},
		error_dialog: {
			error_autofill: "Riempimento automatico impossibile",
			error_autofill_array: "L'area di riempimento non può coprire parte di una formula matriciale.",
			error_autofill_merged: "L'area di riempimento non può coprire parte di una cella unita.",
			error_clipboard_paste: "Accesso agli appunti negato. Consenti le autorizzazioni per gli appunti nel tuo browser.",
			error_deleting_cells: "Impossibile eliminare le celle",
			error_deleting_columns: "Impossibile eliminare le colonne",
			error_deleting_rows: "Impossibile eliminare le righe",
			error_editing_formula: "Errore durante la modifica della formula",
			error_inserting_columns: "Impossibile inserire le colonne",
			error_inserting_rows: "Impossibile inserire le righe",
			error_merging_cells: "Impossibile unire le celle",
			error_merging_cells_content: "Solo una cella della selezione può avere contenuto.",
			error_moving_columns: "Impossibile spostare le colonne",
			error_moving_rows: "Impossibile spostare le righe",
			error_paste: "Impossibile incollare",
			error_paste_merged: "L'area incollata non può coprire parte di una cella unita."
		},
		formula_bar: { manage_named_ranges: "Gestisci intervalli denominati" },
		link_dialog: {
			body_placeholder: "Messaggio (facoltativo)",
			cell_reference_placeholder: "Riferimento di cella",
			close: "Chiudi",
			delete: "Elimina",
			document_tab: "Collegamento al documento",
			email_placeholder: "Indirizzo e-mail",
			email_tab: "E-mail",
			external_tab: "Collegamento esterno",
			invalid_email: "Inserisci un indirizzo e-mail valido",
			invalid_reference: "Inserisci un riferimento di cella valido",
			invalid_url: "Inserisci un URL valido",
			label_placeholder: "Etichetta",
			save: "Salva",
			subject_placeholder: "Oggetto (facoltativo)",
			title_add: "Aggiungi collegamento",
			title_edit: "Modifica collegamento",
			tooltip_placeholder: "Suggerimento (facoltativo)",
			url_placeholder: "URL"
		},
		link_tooltip: {
			break: "Rimuovi collegamento",
			copy: "Copia collegamento",
			edit: "Modifica collegamento"
		},
		name_manager_dialog: {
			add_new_range: "Aggiungi nuovo intervallo",
			apply: "Applica modifiche",
			back_to_list: "Torna alla lista",
			cancel: "Annulla",
			default_range_prefix: "Intervallo",
			delete: "Elimina intervallo",
			edit: "Modifica intervallo",
			edit_range: "Modifica intervallo",
			empty_message1: "Non sono ancora stati aggiunti intervalli denominati.",
			empty_message2: "Fai clic su \"Aggiungi nuovo\" per crearne uno.",
			enter_formula: "Inserisci formula",
			enter_range_name: "Inserisci nome intervallo",
			global: "(Globale)",
			new: "Aggiungi nuovo",
			new_named_range: "Nuovo intervallo denominato",
			no_search_results: "Nessun intervallo denominato corrisponde alla tua ricerca.",
			range_name: "Nome intervallo",
			refers_to: "Fa riferimento a",
			scope_filter_all: "Tutti",
			scope_filter_current: "Foglio corrente",
			scope_filter_global: "Globale",
			scope_helper: "L'ambito dell'intervallo denominato determina dove è disponibile.",
			scope_label: "Ambito",
			search_placeholder: "Cerca...",
			title: "Intervalli denominati",
			use_selection: "Usa intervallo selezionato",
			workbook: "Cartella di lavoro"
		},
		named_styles: {
			accent_1: "Evidenziatore 1",
			accent_2: "Evidenziatore 2",
			accent_3: "Evidenziatore 3",
			accent_4: "Evidenziatore 4",
			accent_5: "Evidenziatore 5",
			accent_6: "Evidenziatore 6",
			add_new_style: "Aggiungi nuovo",
			alignment_label: "Allineamento",
			apply: "Applica",
			back_to_list: "Torna all'elenco",
			background_color_label: "Colore di sfondo",
			border_label: "Bordo",
			cancel: "Annulla",
			category_data_and_model: "Dati e modello",
			category_good_bad_neutral: "Buono, negativo e neutrale",
			category_number_format: "Formato numero",
			category_themed_cell_styles: "Stili di cella a tema",
			category_titles_and_headings: "Titoli e intestazioni",
			custom_format_placeholder: "es. #,##0.00 o \"€\"#,##0",
			custom_format_required: "Il formato personalizzato non può essere vuoto",
			default_name_prefix: "Stile",
			delete_style: "Elimina stile",
			empty_message1: "Nessuno stile personalizzato.",
			empty_message2: "Fai clic su 'Aggiungi nuovo' per crearne uno.",
			fill_label: "Riempimento",
			font_label: "Carattere",
			font_style_label: "Stile",
			format_label: "Formato",
			horizontal_align_label: "Orizzontale",
			line_style_label: "Stile della linea",
			manage_styles: "Gestisci stili",
			name_already_exists: "Esiste già uno stile con questo nome",
			name_label: "Nome",
			name_placeholder: "Nome dello stile",
			new_style: "Nuovo stile",
			number_label: "Numero",
			panel_title: "Stili di cella",
			section_custom: "Personalizzato",
			section_theme: "Tema",
			style_properties: "Proprietà dello stile",
			update_style: "Modifica stile",
			vertical_align_label: "Verticale"
		},
		navigation: {
			add_sheet: "Aggiungi foglio",
			sheet_list: "Elenco fogli"
		},
		num_fmt: {
			cancel: "Annulla",
			close: "Chiudi finestra",
			save: "Salva",
			title: "Formato numero personalizzato"
		},
		regional_settings: {
			language: { display_language: {
				de: "Deutsch",
				en: "English",
				es: "Español",
				fr: "Français",
				it: "Italiano"
			} },
			locale: {
				delimiter_comma: "Virgola",
				delimiter_semicolon: "Punto e virgola",
				locale_example1: "Numero",
				locale_example2: "Data e ora",
				locale_example3: "Separatore formule",
				locale_label: "Impostazioni locali",
				title: "Impostazioni locali"
			},
			open_regional_settings: "Apri impostazioni regionali",
			timezone: {
				timezone_helper: "La modifica di questa impostazione influirà sulle funzioni relative a data e ora, incluse ADESSO() e OGGI().",
				timezone_label: "Fuso orario",
				title: "Fuso orario"
			},
			title: "Impostazioni regionali"
		},
		right_drawer: {
			close: "Chiudi",
			resize_drawer: "Ridimensiona pannello"
		},
		sheet_delete: {
			cancel: "Annulla",
			confirm: "Sì, elimina foglio",
			message: "Il foglio '{{sheetName}}' verrà eliminato.",
			title: "Sei sicuro?"
		},
		sheet_tab: {
			change_color: "Cambia colore",
			delete: "Elimina",
			duplicate: "Duplica",
			hide_sheet: "Nascondi foglio",
			move_left: "Sposta a sinistra",
			move_right: "Sposta a destra",
			open_menu: "Apri menu del foglio",
			rename: "Rinomina"
		},
		themes: {
			accent_color_label: "Accento {{n}}",
			apply: "Applica",
			back_to_list: "Torna alla lista",
			bg_color_label: "Sfondo",
			cancel: "Annulla",
			custom_theme_name: "Personalizzato",
			customize_theme: "Personalizza tema",
			dark_color_label: "Scuro",
			fol_hlink_color_label: "Link visitato",
			hlink_color_label: "Link",
			light_color_label: "Chiaro",
			manage_themes: "Gestisci temi",
			panel_title: "Temi",
			text_color_label: "Testo"
		},
		toolbar: {
			add_link: "Inserisci collegamento",
			align_center: "Allinea al centro",
			align_left: "Allinea a sinistra",
			align_right: "Allinea a destra",
			bold: "Grassetto",
			borders: {
				all: "Tutti i bordi",
				bottom: "Bordi inferiori",
				clear: "Rimuovi bordi",
				color: "Colore bordo",
				horizontal: "Bordi orizzontali",
				inner: "Bordi interni",
				left: "Bordi sinistri",
				outer: "Bordi esterni",
				right: "Bordi destri",
				style: "Stile bordo",
				title: "Bordi",
				top: "Bordi superiori",
				vertical: "Bordi verticali"
			},
			clear_formatting: "Cancella formattazione",
			conditional_formatting: "Formattazione condizionale",
			copy_styles: "Copia stili",
			currency: "Formato valuta",
			decimal_places_decrease: "Riduci decimali",
			decimal_places_increase: "Aumenta decimali",
			decrease_font_size: "Riduci dimensione carattere",
			download_png: "Scarica come PNG",
			fill_color: "Colore riempimento",
			font_color: "Colore carattere",
			font_size: "Dimensione carattere",
			format_menu: {
				auto: "Automatico",
				currency_eur: "Euro (EUR)",
				currency_eur_example: "€",
				currency_gbp: "Sterlina britannica (GBP)",
				currency_gbp_example: "£",
				currency_usd: "Dollaro (USD)",
				currency_usd_example: "$",
				custom: "Personalizzato",
				date_long: "Data lunga",
				date_short: "Data breve",
				number: "Numero",
				percentage: "Percentuale",
				percentage_example: "10%"
			},
			format_number: "Formato numero",
			increase_font_size: "Aumenta dimensione carattere",
			italic: "Corsivo",
			merge_cells: "Unisci celle",
			merge_menu: {
				merge: "Unisci celle",
				merge_across: "Unisci orizzontalmente",
				merge_center: "Unisci e centra",
				merge_down: "Unisci verticalmente",
				unmerge: "Separa celle"
			},
			named_styles: "Stili di cella",
			percentage: "Formato percentuale",
			redo: "Ripeti",
			scroll_left: "Scorri a sinistra",
			scroll_right: "Scorri a destra",
			selected_png: "Esporta area selezionata come PNG",
			show_hide_grid_lines: "Mostra/nascondi griglia",
			strike_through: "Barrato",
			themes: "Temi",
			underline: "Sottolineato",
			undo: "Annulla",
			vertical_align_bottom: "Allinea in basso",
			vertical_align_middle: "Allinea al centro",
			vertical_align_top: "Allinea in alto",
			wrap_text: "Testo a capo"
		}
	} }
}, _s = ft.createInstance({
	resources: gs,
	lng: "en-US",
	interpolation: { escapeValue: !1 }
}), vs = g(({ themeVariables: e, model: t, rootContainer: n, canEdit: r = !0 }, i) => {
	let a = n ?? document.body;
	return y(() => (a.classList.contains("ic-root") && console.warn("rootContainer already in use:", a), a.classList.add("ic-root"), () => a.classList.remove("ic-root")), [a]), S(() => {
		if (e) return zn(e, a), () => Bn(a);
	}, [a, e]), x(i, () => ({ setLanguage(e) {
		if (_s.language !== e) {
			_s.changeLanguage(e);
			let n = e.split("-")[0];
			t.setLanguage(n);
		}
	} })), /* @__PURE__ */ G("div", {
		className: "ic-widget",
		children: /* @__PURE__ */ G(E, {
			i18n: _s,
			children: /* @__PURE__ */ G(ps, {
				model: t,
				workbookState: new Jo(),
				canEdit: r
			})
		})
	});
});
vs.displayName = "IronCalc";
//#endregion
//#region src/index.ts
var ys = async (t) => {
	let n = e(t);
	return await _s.init(), await n;
};
//#endregion
export { q as Button, Pi as Checkbox, Yt as Confirm, J as IconButton, Y as Input, vs as IronCalc, Et as IronCalcIcon, Dt as IronCalcIconWhite, Ot as IronCalcLogo, Oa as Menu, go as MenuDivider, $ as MenuItem, ka as MenuItemWithSubmenu, r as Model, Aa as Switch, Xi as ToggleButton, Z as Tooltip, Rn as darkThemeVariables, ys as init };

