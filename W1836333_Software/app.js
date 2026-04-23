
const $ = (id) => document.getElementById(id);

const state = {
  lastReport: null
};

const inputs = {
  buildingType: $("buildingType"),
  location: $("location"),
  quality: $("quality"),
  procurement: $("procurement"),
  existingArea: $("existingArea"),
  newArea: $("newArea"),
  storeys: $("storeys"),
  siteArea: $("siteArea")
};

const ui = {
  buildPill: $("buildPill"),
  statusPill: $("statusPill"),
  assumptionNote: $("assumptionNote"),
  btnCalculate: $("btnCalculate"),
  btnReset: $("btnReset"),
  btnExport: $("btnExport"),

  kpiBuildCost: $("kpiBuildCost"),
  kpiBuildRate: $("kpiBuildRate"),
  kpiFees: $("kpiFees"),
  kpiFeeRate: $("kpiFeeRate"),
  kpiContingency: $("kpiContingency"),
  kpiContRate: $("kpiContRate"),
  kpiTotal: $("kpiTotal"),
  kpiTotalRange: $("kpiTotalRange"),

  mTotalArea: $("mTotalArea"),
  mCoverage: $("mCoverage"),
  mFAR: $("mFAR"),
  mDensity: $("mDensity"),

  pDesign: $("pDesign"),
  pBuild: $("pBuild"),
  pRisk: $("pRisk"),

  bBase: $("bBase"),
  bFactors: $("bFactors"),
  bFees: $("bFees"),
  bCont: $("bCont"),

  debug: $("debug")
};

function moneyGBP(n) {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(n);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

const TYPE_DEFAULTS = {
  rear_extension: {
    label: "Residential — Rear Extension",
    buildRate: 2400,
    feeRate: 0.11,
    contingency: 0.12,
    designWeeks: [4, 8],
    buildWeeksPer10sqm: 2.2,
    risk: "Party wall / neighbour constraints often increase time."
  },
  loft_conversion: {
    label: "Residential — Loft Conversion",
    buildRate: 2200,
    feeRate: 0.11,
    contingency: 0.13,
    designWeeks: [5, 9],
    buildWeeksPer10sqm: 2.0,
    risk: "Structure + access constraints can increase contingency."
  },
  new_build_house: {
    label: "Residential — New Build House",
    buildRate: 2600,
    feeRate: 0.10,
    contingency: 0.14,
    designWeeks: [8, 14],
    buildWeeksPer10sqm: 1.6,
    risk: "Groundworks and utilities are common cost drivers."
  },
  new_build_apartments: {
    label: "Residential — New Build Apartments",
    buildRate: 2800,
    feeRate: 0.10,
    contingency: 0.16,
    designWeeks: [10, 18],
    buildWeeksPer10sqm: 1.4,
    risk: "Fire strategy + coordination increases approvals time."
  },
  office: {
    label: "Commercial — Office",
    buildRate: 3000,
    feeRate: 0.09,
    contingency: 0.14,
    designWeeks: [10, 16],
    buildWeeksPer10sqm: 1.2,
    risk: "MEP coordination is a frequent programme risk."
  },
  retail: {
    label: "Commercial — Retail",
    buildRate: 2700,
    feeRate: 0.09,
    contingency: 0.13,
    designWeeks: [8, 14],
    buildWeeksPer10sqm: 1.2,
    risk: "Fit-out scope can swing costs significantly."
  },
  mixed_use: {
    label: "Mixed Use",
    buildRate: 2950,
    feeRate: 0.10,
    contingency: 0.16,
    designWeeks: [12, 20],
    buildWeeksPer10sqm: 1.3,
    risk: "Mixed compliance requirements increase coordination."
  }
};

function getInputs() {
  return {
    buildingType: inputs.buildingType.value,
    existingArea: Number(inputs.existingArea.value),
    newArea: Number(inputs.newArea.value),
    storeys: Number(inputs.storeys.value),
    siteArea: Number(inputs.siteArea.value),
    locationFactor: Number(inputs.location.value),
    qualityFactor: Number(inputs.quality.value),
    procurement: inputs.procurement.value
  };
}

function computeReport(x) {
  const def = TYPE_DEFAULTS[x.buildingType] ?? TYPE_DEFAULTS.rear_extension;

  const baseBuildRate = def.buildRate;
  const factor = x.locationFactor * x.qualityFactor;

  const feeAdj = x.procurement === "design_build" ? 0.85 : 1.0;
  const contAdj = x.procurement === "design_build" ? 1.10 : 1.0;

  const buildCostBase = x.newArea * baseBuildRate;
  const buildCost = buildCostBase * factor;

  const feeRate = clamp(def.feeRate * feeAdj, 0.05, 0.18);
  const fees = buildCost * feeRate;

  const contingencyRate = clamp(def.contingency * contAdj, 0.08, 0.25);
  const contingency = buildCost * contingencyRate;

  const total = buildCost + fees + contingency;
  const totalLow = total * 0.92;
  const totalHigh = total * 1.08;

  const totalArea = x.existingArea + x.newArea;
  const far = x.siteArea > 0 ? totalArea / x.siteArea : 0;
  const coverageProxy = x.siteArea > 0
    ? clamp((x.newArea / x.siteArea) * (1 / Math.max(1, x.storeys)), 0, 2)
    : 0;

  let unitsProxy = null;
  if (x.buildingType === "new_build_apartments" || x.buildingType === "mixed_use") {
    unitsProxy = Math.max(1, Math.round(x.newArea / 55));
  }

  const [dwMin, dwMax] = def.designWeeks;
  const buildWeeks = Math.max(6, Math.round((x.newArea / 10) * def.buildWeeksPer10sqm));
  const buildWeeksAdj = x.qualityFactor > 1.05 ? buildWeeks + 2 : buildWeeks;

  const assumptions = [
    `Type default: ${def.label}`,
    `Build rate: £${baseBuildRate.toLocaleString()}/m² (proxy)`,
    `Location factor: ${x.locationFactor.toFixed(2)}`,
    `Quality factor: ${x.qualityFactor.toFixed(2)}`,
    `Procurement: ${x.procurement === "design_build" ? "Design & Build" : "Traditional"}`
  ];

  return {
    input: { ...x },
    defaults: def,
    costs: {
      baseBuildRate,
      factor,
      buildCostBase,
      buildCost,
      feeRate,
      fees,
      contingencyRate,
      contingency,
      total,
      totalLow,
      totalHigh
    },
    metrics: {
      totalArea,
      far,
      coverageProxy,
      unitsProxy
    },
    programme: {
      designWeeks: [dwMin, dwMax],
      buildWeeks,
      buildWeeksAdj,
      risk: def.risk
    },
    assumptions
  };
}

function buildCalculationSummary(report) {
  return [
    `Project type: ${report.defaults.label}`,
    ``,
    `INPUTS`,
    `• Existing area: ${report.input.existingArea} m²`,
    `• New / added area: ${report.input.newArea} m²`,
    `• Storeys: ${report.input.storeys}`,
    `• Site area: ${report.input.siteArea} m²`,
    `• Location factor: ${report.input.locationFactor.toFixed(2)}`,
    `• Quality factor: ${report.input.qualityFactor.toFixed(2)}`,
    `• Procurement: ${report.input.procurement === "design_build" ? "Design & Build" : "Traditional"}`,
    ``,
    `COST CALCULATION`,
    `• Base build rate: £${report.costs.baseBuildRate.toLocaleString()} / m²`,
    `• Base build cost: ${moneyGBP(report.costs.buildCostBase)}`,
    `• Combined factor: ×${report.costs.factor.toFixed(2)}`,
    `• Adjusted build cost: ${moneyGBP(report.costs.buildCost)}`,
    `• Professional fees: ${moneyGBP(report.costs.fees)} @ ${(report.costs.feeRate * 100).toFixed(1)}%`,
    `• Contingency: ${moneyGBP(report.costs.contingency)} @ ${(report.costs.contingencyRate * 100).toFixed(1)}%`,
    `• Total estimate: ${moneyGBP(report.costs.total)}`,
    `• Range: ${moneyGBP(report.costs.totalLow)} – ${moneyGBP(report.costs.totalHigh)}`,
    ``,
    `DESIGN METRICS`,
    `• Total area: ${report.metrics.totalArea.toLocaleString()} m²`,
    `• Site coverage: ${(report.metrics.coverageProxy * 100).toFixed(1)}%`,
    `• FAR: ${report.metrics.far.toFixed(2)}`,
    `• Density proxy: ${report.metrics.unitsProxy ? `${report.metrics.unitsProxy} units` : "N/A"}`,
    ``,
    `PROGRAMME`,
    `• Design and approvals: ${report.programme.designWeeks[0]}–${report.programme.designWeeks[1]} weeks`,
    `• Construction: ${report.programme.buildWeeksAdj}–${report.programme.buildWeeksAdj + 4} weeks`,
    `• Risk note: ${report.programme.risk}`
  ].join("\n");
}

function render(report) {
  if (ui.statusPill) ui.statusPill.textContent = "Calculated";

  if (ui.assumptionNote) {
    ui.assumptionNote.textContent =
      `Assumptions loaded for: ${report.defaults.label}. Rates are prototype proxies; replace with validated data in final build.`;
  }

  ui.kpiBuildCost.textContent = moneyGBP(report.costs.buildCost);
  ui.kpiBuildRate.textContent =
    `Rate: £${report.costs.baseBuildRate.toLocaleString()}/m² • Factors: ×${report.costs.factor.toFixed(2)}`;

  ui.kpiFees.textContent = moneyGBP(report.costs.fees);
  ui.kpiFeeRate.textContent = `Fee rate: ${(report.costs.feeRate * 100).toFixed(1)}%`;

  ui.kpiContingency.textContent = moneyGBP(report.costs.contingency);
  ui.kpiContRate.textContent = `Contingency: ${(report.costs.contingencyRate * 100).toFixed(1)}%`;

  ui.kpiTotal.textContent = moneyGBP(report.costs.total);
  ui.kpiTotalRange.textContent =
    `Indicative range: ${moneyGBP(report.costs.totalLow)} – ${moneyGBP(report.costs.totalHigh)}`;

  ui.mTotalArea.textContent = `${report.metrics.totalArea.toLocaleString()} m²`;
  ui.mCoverage.textContent = `${(report.metrics.coverageProxy * 100).toFixed(1)}% (proxy)`;
  ui.mFAR.textContent = report.metrics.far.toFixed(2);
  ui.mDensity.textContent = report.metrics.unitsProxy
    ? `${report.metrics.unitsProxy} units (proxy)`
    : "—";

  ui.pDesign.textContent =
    `${report.programme.designWeeks[0]}–${report.programme.designWeeks[1]} weeks`;
  ui.pBuild.textContent =
    `${report.programme.buildWeeksAdj}–${report.programme.buildWeeksAdj + 4} weeks`;
  ui.pRisk.textContent = report.programme.risk;

  ui.bBase.textContent = moneyGBP(report.costs.buildCostBase);
  ui.bFactors.textContent = `×${report.costs.factor.toFixed(2)} (location × quality)`;
  ui.bFees.textContent = `${moneyGBP(report.costs.fees)} @ ${(report.costs.feeRate * 100).toFixed(1)}%`;
  ui.bCont.textContent = `${moneyGBP(report.costs.contingency)} @ ${(report.costs.contingencyRate * 100).toFixed(1)}%`;

  if (ui.debug) {
    ui.debug.textContent = buildCalculationSummary(report);
  }
}

function calculate() {
  const x = getInputs();

  if (!Number.isFinite(x.newArea) || x.newArea <= 0) {
    if (ui.statusPill) ui.statusPill.textContent = "Fix inputs";
    if (ui.assumptionNote) ui.assumptionNote.textContent = "New/added area must be > 0.";
    return;
  }

  if (!Number.isFinite(x.siteArea) || x.siteArea <= 0) {
    if (ui.statusPill) ui.statusPill.textContent = "Fix inputs";
    if (ui.assumptionNote) ui.assumptionNote.textContent = "Site area must be > 0.";
    return;
  }

  if (!Number.isFinite(x.storeys) || x.storeys <= 0) {
    if (ui.statusPill) ui.statusPill.textContent = "Fix inputs";
    if (ui.assumptionNote) ui.assumptionNote.textContent = "Storeys must be >= 1.";
    return;
  }

  const report = computeReport(x);
  state.lastReport = report;
  render(report);
}

function reset() {
  inputs.buildingType.value = "rear_extension";
  inputs.location.value = "1.15";
  inputs.quality.value = "1.00";
  inputs.procurement.value = "traditional";
  inputs.existingArea.value = "90";
  inputs.newArea.value = "25";
  inputs.storeys.value = "1";
  inputs.siteArea.value = "180";

  if (ui.statusPill) ui.statusPill.textContent = "Ready";
  if (ui.assumptionNote) ui.assumptionNote.textContent = "";

  ui.kpiBuildCost.textContent = "—";
  ui.kpiBuildRate.textContent = "—";
  ui.kpiFees.textContent = "—";
  ui.kpiFeeRate.textContent = "—";
  ui.kpiContingency.textContent = "—";
  ui.kpiContRate.textContent = "—";
  ui.kpiTotal.textContent = "—";
  ui.kpiTotalRange.textContent = "—";
  ui.mTotalArea.textContent = "—";
  ui.mCoverage.textContent = "—";
  ui.mFAR.textContent = "—";
  ui.mDensity.textContent = "—";
  ui.pDesign.textContent = "—";
  ui.pBuild.textContent = "—";
  ui.pRisk.textContent = "—";
  ui.bBase.textContent = "—";
  ui.bFactors.textContent = "—";
  ui.bFees.textContent = "—";
  ui.bCont.textContent = "—";

  if (ui.debug) ui.debug.textContent = "";

  state.lastReport = null;
}

function exportJSON() {
  if (!state.lastReport) {
    if (ui.statusPill) ui.statusPill.textContent = "Nothing to export";
    return;
  }

  const blob = new Blob([JSON.stringify(state.lastReport, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `archi-sketch-report_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

if (ui.btnCalculate) ui.btnCalculate.addEventListener("click", calculate);
if (ui.btnReset) ui.btnReset.addEventListener("click", reset);
if (ui.btnExport) ui.btnExport.addEventListener("click", exportJSON);

calculate();

let lastScrollY = window.scrollY;
const topbar = document.querySelector(".topbar");

window.addEventListener("scroll", () => {
  const currentScrollY = window.scrollY;

  if (!topbar) return;

  if (currentScrollY > lastScrollY && currentScrollY > 80) {
    topbar.style.transform = "translateY(-100%)";
  } else {
    topbar.style.transform = "translateY(0)";
  }

  lastScrollY = currentScrollY;
});


const themeToggle = document.getElementById("themeToggle");

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-mode", isDark);

  if (themeToggle) {
    themeToggle.checked = isDark;
  }
}

const savedTheme = localStorage.getItem("archiSketchTheme") || "light";
applyTheme(savedTheme);

if (themeToggle) {
  themeToggle.addEventListener("change", () => {
    const nextTheme = themeToggle.checked ? "dark" : "light";
    localStorage.setItem("archiSketchTheme", nextTheme);
    applyTheme(nextTheme);
  });
}