import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type LegendItem,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  BarController,
  BarElement,
  Tooltip,
  Legend,
);

function customLegendClick(
  _e: unknown,
  legendItem: LegendItem,
  legend: { chart: ChartJS },
) {
  const index = legendItem.datasetIndex;
  if (index === undefined) return;
  const ci = legend.chart;
  const meta = ci.getDatasetMeta(index);

  let isOnlyVisible = true;
  for (let i = 0; i < ci.data.datasets.length; i++) {
    if (i !== index) {
      const m = ci.getDatasetMeta(i);
      if (!m.hidden) {
        isOnlyVisible = false;
        break;
      }
    }
  }

  if (isOnlyVisible) {
    for (let i = 0; i < ci.data.datasets.length; i++) {
      ci.getDatasetMeta(i).hidden = false;
    }
  } else {
    for (let i = 0; i < ci.data.datasets.length; i++) {
      ci.getDatasetMeta(i).hidden = i !== index;
    }
    meta.hidden = false;
  }

  ci.update();
}

ChartJS.defaults.plugins.legend.onClick = customLegendClick;

const originalGenerateLabels = ChartJS.defaults.plugins.legend.labels.generateLabels;
ChartJS.defaults.plugins.legend.labels.generateLabels = function generateLabels(chart) {
  const labels = originalGenerateLabels(chart);

  const visibleCount = labels.filter((l) => !l.hidden).length;
  const totalCount = labels.length;
  const isFiltering = visibleCount < totalCount;

  labels.forEach((label) => {
    const l = label as LegendItem & {
      textDecoration?: string;
      fontColor?: string;
      strokeStyle?: string;
    };
    l.textDecoration = "none";

    if (l.hidden) {
      l.fillStyle = "transparent";
      l.strokeStyle = "#cbd5e1";
      l.fontColor = "#64748b";
    } else if (isFiltering) {
      l.fontColor = "#1e293b";
    } else {
      l.fontColor = "#64748b";
    }
  });
  return labels;
};
