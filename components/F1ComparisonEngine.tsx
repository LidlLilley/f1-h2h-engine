"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Lottie } from "lottie-react";

// --- TYPESCRIPT INTERFACES ---

export type CategoryMode = "drivers" | "constructors";

export type StatKey =
  // Shared Stats
  | "points"
  | "wins"
  | "podiums"
  | "poles"
  | "position"
  | "dnfs"
  // Driver-Only Stats
  | "top10s"
  | "bestFinish"
  | "overtakes"
  // Constructor-Only Stats
  | "oneTwos"
  | "doublePoints"
  | "avgPitStop";

export interface Competitor {
  id: string;
  name: string;
  shortName: string;
  subtitle: string;
  stats: Record<StatKey, number>;
}

interface F1ComparisonEngineProps {
  drivers: Competitor[];
  constructors: Competitor[];
}

interface StatOption {
  key: StatKey;
  label: string;
  scope: "both" | "drivers" | "constructors";
}

const ALL_STAT_OPTIONS: StatOption[] = [
  { key: "wins", label: "Grand Prix Wins", scope: "both" },
  { key: "podiums", label: "Season Podiums", scope: "both" },
  { key: "poles", label: "Pole Positions", scope: "both" },
  { key: "oneTwos", label: "1-2 Finishes", scope: "constructors" },
  { key: "doublePoints", label: "Double Top-10s", scope: "constructors" },
  { key: "avgPitStop", label: "Avg Pit Stop (s)", scope: "constructors" },
  { key: "top10s", label: "Top 10 Finishes", scope: "drivers" },
  { key: "overtakes", label: "Season Overtakes", scope: "drivers" },
  { key: "bestFinish", label: "Best Race Finish", scope: "drivers" },
  { key: "points", label: "Championship Points", scope: "both" },
  { key: "position", label: "Standings Position", scope: "both" },
  { key: "dnfs", label: "Total DNFs", scope: "both" },
];

const BROADCAST_SWATCHES = [
  { label: "F1 Red", hex: "#E10600" },
  { label: "McLaren Papaya", hex: "#FF8000" },
  { label: "Mercedes Teal", hex: "#27F4D2" },
  { label: "Ferrari Corsa", hex: "#E8002D" },
  { label: "Red Bull Blue", hex: "#3671C6" },
  { label: "Williams Blue", hex: "#64C4FF" },
];

// --- LOTTIE JSON TEXT & SHAPE COLOUR INJECTION HELPERS ---

function hexToLottieRgb(hex: string): [number, number, number, number] {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  return [
    Number((isNaN(r) ? 0.88 : r).toFixed(4)),
    Number((isNaN(g) ? 0.02 : g).toFixed(4)),
    Number((isNaN(b) ? 0 : b).toFixed(4)),
    1,
  ];
}

function formatStatValue(value: number, statKey: StatKey): string {
  if (statKey === "position" || statKey === "bestFinish") {
    return `P${value}`;
  }
  if (statKey === "avgPitStop") {
    return `${value.toFixed(2)}s`;
  }
  return String(value);
}

function getStatLabel(statKey: StatKey): string {
  return (
    ALL_STAT_OPTIONS.find((opt) => opt.key === statKey)?.label ||
    statKey.toUpperCase()
  );
}

/**
 * Recursively walks inside an AE Shape Layer (e.g. Shape_Transition_1 -> Rectangle 1 -> Fill 1)
 * and overwrites any Fill ('fl') or Stroke ('st') colour (both static and keyframed).
 */
function updateShapeColors(
  shapeItems: any[],
  lottieRgb: [number, number, number, number]
) {
  if (!Array.isArray(shapeItems)) return;

  for (const item of shapeItems) {
    if ((item?.ty === "fl" || item?.ty === "st") && item?.c?.k) {
      if (Array.isArray(item.c.k)) {
        if (typeof item.c.k[0] === "number") {
          // Static colour array [R, G, B, A]
          item.c.k = lottieRgb;
        } else if (typeof item.c.k[0] === "object") {
          // Keyframed colour array
          for (const kf of item.c.k) {
            if (Array.isArray(kf.s)) kf.s = lottieRgb;
            if (Array.isArray(kf.e)) kf.e = lottieRgb;
          }
        }
      }
    }

    // Recurse into nested shape groups (e.g. 'Rectangle 1')
    if (Array.isArray(item?.it)) {
      updateShapeColors(item.it, lottieRgb);
    }
  }
}

/**
 * Normalises After Effects PostScript font entries into valid CSS family,
 * weight, and style definitions so mobile WebKit renders them properly.
 */
function normaliseMobileFonts(clonedJson: any) {
  if (!Array.isArray(clonedJson?.fonts?.list)) return;

  clonedJson.fonts.list = clonedJson.fonts.list.map((font: any) => {
    const name = String(font.fName || "");

    if (name.includes("Tomorrow")) {
      return {
        ...font,
        fFamily: "Tomorrow",
        fStyle: "italic",
        fWeight: "700",
        fOrigin: "n",
        fPath: "",
      };
    }

    if (name.includes("ExtraBold")) {
      return {
        ...font,
        fFamily: "Oxanium",
        fStyle: "normal",
        fWeight: "800",
        fOrigin: "n",
        fPath: "",
      };
    }

    if (name.includes("SemiBold")) {
      return {
        ...font,
        fFamily: "Oxanium",
        fStyle: "normal",
        fWeight: "600",
        fOrigin: "n",
        fPath: "",
      };
    }

    if (name.includes("Oxanium")) {
      return {
        ...font,
        fFamily: "Oxanium",
        fStyle: "normal",
        fWeight: "400",
        fOrigin: "n",
        fPath: "",
      };
    }

    return font;
  });
}

/**
 * Clones the Bodymovin JSON and dynamically overwrites:
 * 1. Mobile WebKit Font Definitions ('fonts.list')
 * 2. Title & Subtitle ('Text_Broadcast_Title', 'Text_Broadcast_Subtitle')
 * 3. Competitor Names ('Text_Name_1', 'Text_Name_2')
 * 4. Stat Labels ('Text_Stat_1', 'Text_Stat_2', 'Text_Stat_3')
 * 5. Stat Values ('Text_Value_1' through 'Text_Value_6')
 * 6. Animator 2 Fill Color ('fc') on all text layers
 * 7. Fill Color inside 'Shape_Transition_1'
 */
function injectBroadcastData(
  rawLottieJson: any,
  hexColor: string,
  layerTextMap: Record<string, string>
) {
  if (!rawLottieJson) return null;

  const clonedJson = JSON.parse(JSON.stringify(rawLottieJson));
  const lottieRgb = hexToLottieRgb(hexColor);

  // Fix mobile font metadata before rendering layers
  normaliseMobileFonts(clonedJson);

  const updateLayerList = (layers: any[]) => {
    if (!Array.isArray(layers)) return;

    for (const layer of layers) {
      const cleanLayerName = typeof layer.nm === "string" ? layer.nm.trim() : "";

      // A. Update Dynamic Text Layers & Their Animator 2 Fill Colours
      if (cleanLayerName in layerTextMap) {
        const newString = layerTextMap[cleanLayerName];

        // Overwrite text document string in layer.t.d.k
        const textKeyframes = layer?.t?.d?.k;
        if (Array.isArray(textKeyframes)) {
          for (const kf of textKeyframes) {
            if (kf?.s && typeof kf.s.t === "string") {
              kf.s.t = newString;
            }
          }
        }

        // Overwrite Animator 2 Fill Color ('fc')
        const animators = layer?.t?.a;
        if (Array.isArray(animators)) {
          for (const animator of animators) {
            if (animator?.a?.fc?.k) {
              if (typeof animator.a.fc.k[0] === "number") {
                animator.a.fc.k = lottieRgb;
              } else if (typeof animator.a.fc.k[0] === "object") {
                for (const kf of animator.a.fc.k) {
                  if (Array.isArray(kf.s)) kf.s = lottieRgb;
                  if (Array.isArray(kf.e)) kf.e = lottieRgb;
                }
              }
            }
          }
        }
      }

      // B. Update 'Shape_Transition_1' -> 'Rectangle 1' -> 'Fill 1'
      if (cleanLayerName === "Shape_Transition_1") {
        updateShapeColors(layer.shapes, lottieRgb);
      }
    }
  };

  updateLayerList(clonedJson.layers);
  if (Array.isArray(clonedJson.assets)) {
    for (const asset of clonedJson.assets) {
      updateLayerList(asset.layers);
    }
  }

  return clonedJson;
}

export default function F1ComparisonEngine({
  drivers,
  constructors,
}: F1ComparisonEngineProps) {
  // --- 1. LOTTIE TEXT & COLOUR STATE ---
  const [accentHex, setAccentHex] = useState<string>("#E10600");
  const [subtitleText, setSubtitleText] = useState<string>("ROUND 12");
  const [titleText, setTitleText] = useState<string>("TALE OF THE TAPE");
  const [rawLottieData, setRawLottieData] = useState<any | null>(null);

  // --- 2. CASCADING COMPONENT STATE ---
  const [category, setCategory] = useState<CategoryMode>("drivers");
  const activeRoster = category === "drivers" ? drivers : constructors;

  const availableStats = ALL_STAT_OPTIONS.filter(
    (opt) => opt.scope === "both" || opt.scope === category
  );

  const [competitorAId, setCompetitorAId] = useState<string>(
    drivers[0]?.id || ""
  );
  const [competitorBId, setCompetitorBId] = useState<string>(
    drivers[1]?.id || ""
  );

  const [selectedStats, setSelectedStats] = useState<[StatKey, StatKey, StatKey]>([
    "wins",
    "podiums",
    "overtakes",
  ]);

  const [autoSwappedRows, setAutoSwappedRows] = useState<boolean[]>([
    false,
    false,
    false,
  ]);

  const competitorA =
    activeRoster.find((c) => c.id === competitorAId) || activeRoster[0];
  const competitorB =
    activeRoster.find((c) => c.id === competitorBId) || activeRoster[1];

  // Fetch the exported AE JSON from /public/f1-header.json AND wait for mobile fonts
  useEffect(() => {
    let isMounted = true;

    async function initLottieAndFonts() {
      try {
        const fontPromise =
          typeof document !== "undefined" && "fonts" in document
            ? Promise.all([
                document.fonts.load("italic 700 48px 'Tomorrow'"),
                document.fonts.load("400 24px 'Oxanium'"),
                document.fonts.load("600 28px 'Oxanium'"),
                document.fonts.load("800 36px 'Oxanium'"),
              ]).then(() => document.fonts.ready)
            : Promise.resolve();

        const [res] = await Promise.all([
          fetch("/f1-header.json"),
          fontPromise,
        ]);

        if (!res.ok) throw new Error("Lottie JSON not in /public yet");
        const data = await res.json();

        if (isMounted) {
          setRawLottieData(data);
        }
      } catch {
        if (isMounted) {
          setRawLottieData(null);
        }
      }
    }

    initLottieAndFonts();

    return () => {
      isMounted = false;
    };
  }, []);

  // --- 3. CATEGORY SWITCH HANDLER ---
  const handleCategoryChange = (newCategory: CategoryMode) => {
    setCategory(newCategory);
    const newRoster = newCategory === "drivers" ? drivers : constructors;

    setCompetitorAId(newRoster[0]?.id || "");
    setCompetitorBId(newRoster[1]?.id || "");

    if (newCategory === "constructors") {
      setSelectedStats(["wins", "oneTwos", "avgPitStop"]);
    } else {
      setSelectedStats(["wins", "podiums", "overtakes"]);
    }
  };

  // --- 4. AUTO-CURATION IF/ELSE ENGINE ---
  useEffect(() => {
    if (!competitorA || !competitorB) return;

    const curatedStats: [StatKey, StatKey, StatKey] = [...selectedStats];
    const swappedFlags = [false, false, false];
    let hasChanged = false;

    for (let i = 0; i < curatedStats.length; i++) {
      const currentKey = curatedStats[i];
      const valA = competitorA.stats[currentKey];
      const valB = competitorB.stats[currentKey];

      const isStatValidForCategory = availableStats.some(
        (opt) => opt.key === currentKey
      );
      const isBothZero = valA === 0 && valB === 0;

      if (!isStatValidForCategory || isBothZero) {
        const replacement = availableStats.find((opt) => {
          const isAlreadyOnBoard = curatedStats.includes(opt.key);
          const hasNonZeroData =
            competitorA.stats[opt.key] > 0 || competitorB.stats[opt.key] > 0;
          return !isAlreadyOnBoard && hasNonZeroData;
        });

        if (replacement) {
          curatedStats[i] = replacement.key;
          swappedFlags[i] = true;
          hasChanged = true;
        }
      } else {
        swappedFlags[i] = false;
      }
    }

    if (hasChanged) {
      setSelectedStats(curatedStats);
      setAutoSwappedRows(swappedFlags);
    } else {
      setAutoSwappedRows([false, false, false]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, competitorAId, competitorBId]);

  const handleStatChange = (rowIndex: number, newStat: StatKey) => {
    const updatedStats: [StatKey, StatKey, StatKey] = [...selectedStats];
    updatedStats[rowIndex] = newStat;
    setSelectedStats(updatedStats);

    const updatedFlags = [...autoSwappedRows];
    updatedFlags[rowIndex] = false;
    setAutoSwappedRows(updatedFlags);
  };

  // --- 5. BUILD COMPLETE LAYER MAP FOR AFTER EFFECTS ---
  const dynamicAnimationData = useMemo(() => {
    if (!competitorA || !competitorB) return null;

    const stat1Key = selectedStats[0];
    const stat2Key = selectedStats[1];
    const stat3Key = selectedStats[2];

    const layerTextMap: Record<string, string> = {
      // Broadcast Titles
      Text_Broadcast_Subtitle: (subtitleText || " ").toUpperCase(),
      Text_Broadcast_Title: (titleText || " ").toUpperCase(),

      // Competitor Names
      Text_Name_1: (competitorA.shortName || " ").toUpperCase(),
      Text_Name_2: (competitorB.shortName || " ").toUpperCase(),

      // Row 1 (Stat 1 + Values 1 & 2)
      Text_Stat_1: getStatLabel(stat1Key).toUpperCase(),
      Text_Value_1: formatStatValue(competitorA.stats[stat1Key], stat1Key),
      Text_Value_2: formatStatValue(competitorB.stats[stat1Key], stat1Key),

      // Row 2 (Stat 2 + Values 3 & 4)
      Text_Stat_2: getStatLabel(stat2Key).toUpperCase(),
      Text_Value_3: formatStatValue(competitorA.stats[stat2Key], stat2Key),
      Text_Value_4: formatStatValue(competitorB.stats[stat2Key], stat2Key),

      // Row 3 (Stat 3 + Values 5 & 6)
      Text_Stat_3: getStatLabel(stat3Key).toUpperCase(),
      Text_Value_5: formatStatValue(competitorA.stats[stat3Key], stat3Key),
      Text_Value_6: formatStatValue(competitorB.stats[stat3Key], stat3Key),
    };

    return injectBroadcastData(rawLottieData, accentHex, layerTextMap);
  }, [
    rawLottieData,
    accentHex,
    subtitleText,
    titleText,
    competitorA,
    competitorB,
    selectedStats,
  ]);

  // --- 6. CORE COMPARISON HIGHLIGHT LOGIC ---
  function getStatHighlightClass(
    valueA: number,
    valueB: number,
    statKey: StatKey
  ): string {
    if (valueA === valueB) {
      return "text-yellow-500 font-semibold";
    }

    const isInverseStat =
      statKey === "position" ||
      statKey === "bestFinish" ||
      statKey === "dnfs" ||
      statKey === "avgPitStop";

    if (isInverseStat) {
      return valueA < valueB
        ? "text-green-500 font-bold"
        : "text-gray-500 opacity-50";
    } else {
      return valueA > valueB
        ? "text-green-500 font-bold"
        : "text-gray-500 opacity-50";
    }
  }

  if (!competitorA || !competitorB) {
    return (
      <div className="p-6 bg-zinc-900 text-zinc-400 rounded-2xl border border-zinc-800">
        No telemetry available.
      </div>
    );
  }

  // Unique key includes selectedStats so changing any stat dropdown refreshes the AE animation immediately
  const lottieReplayKey = `${accentHex}-${subtitleText}-${titleText}-${competitorA.id}-${competitorB.id}-${selectedStats.join("-")}`;

  return (
    <div className="w-full max-w-md bg-zinc-950 text-white rounded-2xl border border-zinc-800/80 overflow-hidden shadow-2xl relative">
      {/* Hidden Mobile WebKit Font Preloader */}
      <div
        aria-hidden="true"
        className="absolute -top-[9999px] -left-[9999px] w-px h-px opacity-[0.01] pointer-events-none overflow-hidden select-none"
      >
        <span style={{ fontFamily: "'Tomorrow', sans-serif", fontWeight: 700, fontStyle: "italic" }}>
          TALE OF THE TAPE
        </span>
        <span style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 400 }}>
          ROUND 12
        </span>
        <span style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 600 }}>
          VERSTAPPEN
        </span>
        <span style={{ fontFamily: "'Oxanium', sans-serif", fontWeight: 800 }}>
          0123456789
        </span>
      </div>

      {/* --- MEDIA HEADER: AFTER EFFECTS LOTTIE + LIVE GRAPHICS CONTROLS --- */}
      <div className="bg-zinc-900/50 border-b border-zinc-800/80 p-4">
        {/* User Accent Colour Bar */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">
            AE Wipe Colour
          </span>
          <div className="flex items-center gap-2">
            {BROADCAST_SWATCHES.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                title={swatch.label}
                onClick={() => setAccentHex(swatch.hex)}
                className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                  accentHex.toLowerCase() === swatch.hex.toLowerCase()
                    ? "scale-125 ring-2 ring-white"
                    : "opacity-60 hover:opacity-100"
                }`}
                style={{ backgroundColor: swatch.hex }}
              />
            ))}
            <input
              type="color"
              value={accentHex}
              onChange={(e) => setAccentHex(e.target.value)}
              className="w-5 h-5 bg-transparent border-0 cursor-pointer"
              title="Custom Broadcast Hex Colour"
            />
          </div>
        </div>

        {/* User Editable Broadcast Text Inputs */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
              Subtitle (AE Layer)
            </label>
            <input
              type="text"
              maxLength={20}
              value={subtitleText}
              onChange={(e) => setSubtitleText(e.target.value)}
              placeholder="ROUND 12"
              className="w-full bg-zinc-950 text-white text-xs font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-zinc-800 focus:outline-none focus:border-zinc-600"
            />
          </div>
          <div>
            <label className="block text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-1">
              Main Title (AE Layer)
            </label>
            <input
              type="text"
              maxLength={22}
              value={titleText}
              onChange={(e) => setTitleText(e.target.value)}
              placeholder="TALE OF THE TAPE"
              className="w-full bg-zinc-950 text-white text-xs font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-zinc-800 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>

        {/* Lottie Canvas (Looping Enabled) */}
        <div className="w-full aspect-square max-h-56 bg-black rounded-xl border border-zinc-800/80 flex flex-col items-center justify-center overflow-hidden relative">
          {dynamicAnimationData ? (
            <Lottie
              key={lottieReplayKey}
              src={dynamicAnimationData}
              autoplay
              loop={true}
              className="w-full h-full"
            />
          ) : (
            <div
              key={lottieReplayKey}
              className="flex flex-col items-center justify-center text-center p-4 select-none"
            >
              <span
                className="text-xs font-extrabold italic tracking-[0.25em] uppercase transition-colors duration-300"
                style={{ color: accentHex }}
              >
                {subtitleText || " "}
              </span>
              <h2 className="text-2xl font-black italic tracking-tight uppercase text-white mt-1">
                {titleText || " "}
              </h2>
              <div
                className="h-1 w-24 rounded-full mt-2 transition-colors duration-300"
                style={{ backgroundColor: accentHex }}
              />
              <span className="text-[10px] text-zinc-500 mt-4 font-mono">
                Drop <code className="text-zinc-300">f1-header.json</code> into{" "}
                <code className="text-zinc-300">/public</code> to load AE Lottie
              </span>
            </div>
          )}
        </div>
      </div>

      {/* --- CONTROL PANEL BODY --- */}
      <div className="p-5">
        {/* TOP LEVEL: CATEGORY DROPDOWN (DRIVERS VS CONSTRUCTORS) */}
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5 px-1">
            Comparison Mode
          </label>
          <select
            aria-label="Select Championship Category"
            value={category}
            onChange={(e) =>
              handleCategoryChange(e.target.value as CategoryMode)
            }
            className="w-full bg-zinc-900 hover:bg-zinc-800 font-extrabold text-xs uppercase tracking-wider rounded-xl px-3.5 py-2.5 border border-zinc-800 focus:outline-none transition-colors cursor-pointer"
            style={{ color: accentHex }}
          >
            <option value="drivers" className="text-white bg-zinc-900">
              Drivers Championship
            </option>
            <option value="constructors" className="text-white bg-zinc-900">
              Constructors Championship
            </option>
          </select>
        </div>

        {/* SECOND LEVEL: COMPETITOR DROPDOWNS */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-zinc-500 font-semibold mb-2 px-1">
            <span>{category === "drivers" ? "Driver A" : "Constructor A"}</span>
            <span className="text-zinc-600 font-bold">VS</span>
            <span>{category === "drivers" ? "Driver B" : "Constructor B"}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col">
              <select
                aria-label="Select Competitor A"
                value={competitorA.id}
                onChange={(e) => setCompetitorAId(e.target.value)}
                className="w-full bg-zinc-900 hover:bg-zinc-800/90 text-white font-bold text-sm rounded-xl px-3 py-2.5 border border-zinc-800 focus:outline-none focus:border-zinc-600 transition-colors cursor-pointer"
              >
                {activeRoster.map((comp) => (
                  <option key={`compA-${comp.id}`} value={comp.id}>
                    {comp.shortName}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-zinc-500 mt-1 px-1 truncate">
                {competitorA.subtitle}
              </span>
            </div>

            <div className="flex flex-col text-right">
              <select
                aria-label="Select Competitor B"
                value={competitorB.id}
                onChange={(e) => setCompetitorBId(e.target.value)}
                className="w-full bg-zinc-900 hover:bg-zinc-800/90 text-white font-bold text-sm rounded-xl px-3 py-2.5 border border-zinc-800 focus:outline-none focus:border-zinc-600 transition-colors cursor-pointer text-right"
              >
                {activeRoster.map((comp) => (
                  <option key={`compB-${comp.id}`} value={comp.id}>
                    {comp.shortName}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-zinc-500 mt-1 px-1 truncate">
                {competitorB.subtitle}
              </span>
            </div>
          </div>
        </div>

        {/* MATCHUP BOARD: 3 DYNAMIC STAT ROWS */}
        <div className="space-y-2.5">
          {selectedStats.map((statKey, rowIndex) => {
            const valA = competitorA.stats[statKey];
            const valB = competitorB.stats[statKey];
            const wasAutoSwapped = autoSwappedRows[rowIndex];

            return (
              <div
                key={rowIndex}
                className="grid grid-cols-[1fr_auto_1fr] items-center bg-zinc-900/60 border border-zinc-800/60 rounded-xl px-4 py-3"
              >
                <span
                  className={`text-lg tabular-nums transition-colors duration-200 ${getStatHighlightClass(
                    valA,
                    valB,
                    statKey
                  )}`}
                >
                  {formatStatValue(valA, statKey)}
                </span>

                <div className="flex flex-col items-center mx-2">
                  <select
                    aria-label={`Select Stat Row ${rowIndex + 1}`}
                    value={statKey}
                    onChange={(e) =>
                      handleStatChange(rowIndex, e.target.value as StatKey)
                    }
                    className="bg-zinc-950 text-zinc-300 text-xs font-medium uppercase tracking-wider px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 focus:outline-none cursor-pointer text-center"
                  >
                    {availableStats.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {wasAutoSwapped && (
                    <span className="text-[9px] text-emerald-400/80 uppercase tracking-widest mt-1">
                      Auto-Curated (Non-Zero)
                    </span>
                  )}
                </div>

                <span
                  className={`text-lg tabular-nums text-right transition-colors duration-200 ${getStatHighlightClass(
                    valB,
                    valA,
                    statKey
                  )}`}
                >
                  {formatStatValue(valB, statKey)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}