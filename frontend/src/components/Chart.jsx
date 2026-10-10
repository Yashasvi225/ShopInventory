import { useEffect, useRef } from 'react';
import ChartJS from 'chart.js/auto';

export default function Chart({ type, data, label, valueFormat, xTitle, yTitle }) {
  const canvas = useRef(null);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const theme = getComputedStyle(canvas.current);
    const color = name => theme.getPropertyValue(name).trim();
    // Translate the existing series colors into the shared theme. Values and labels stay intact.
    const palette = { '#c15b3a': color('--color-primary'), '#c15b3a20': `${color('--color-primary')}18`, '#7a7c52': color('--color-sage') };
    const themedColor = value => Array.isArray(value) ? value.map(themedColor) : palette[value] || value;
    const formatter = new Intl.NumberFormat('en-IN', valueFormat === 'money' ? { style: 'currency', currency: 'INR', maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });
    const axisFormatter = new Intl.NumberFormat('en-IN', valueFormat === 'money' ? { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: 2 });
    const chart = new ChartJS(canvas.current, { type, data: { ...data, datasets: data.datasets.map(dataset => ({ ...dataset,
      borderColor: themedColor(dataset.borderColor), backgroundColor: themedColor(dataset.backgroundColor),
    })) }, options: {
      responsive: true, maintainAspectRatio: false,
      animation: motion.matches ? false : { duration: 250 },
      color: color('--color-muted'), font: { family: theme.fontFamily, size: 11 },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 20, font: { family: theme.fontFamily, size: 11 } } },
        tooltip: { backgroundColor: color('--color-heading'), padding: 12, titleFont: { family: theme.fontFamily, size: 12 }, bodyFont: { family: theme.fontFamily, size: 12 },
          callbacks: { label: context => `${context.dataset.label || context.label}: ${formatter.format(type === 'doughnut' ? context.parsed : context.parsed.y)}` } },
      },
      ...(type === 'doughnut' ? { cutout: '72%' } : { scales: {
        x: { title: { display: !!xTitle, text: xTitle }, grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8, color: color('--color-muted'), font: { family: theme.fontFamily, size: 11 } } },
        y: { beginAtZero: true, title: { display: !!yTitle, text: yTitle }, grid: { color: color('--color-border') }, border: { display: false }, ticks: { callback: value => axisFormatter.format(value), maxTicksLimit: 6, color: color('--color-muted'), font: { family: theme.fontFamily, size: 11 } } },
      } }),
    } });
    const updateMotion = () => {
      chart.options.animation = motion.matches ? false : { duration: 250 };
      chart.stop(); chart.update('none');
    };
    motion.addEventListener('change', updateMotion);
    return () => { motion.removeEventListener('change', updateMotion); chart.destroy(); };
  }, [type, data, valueFormat, xTitle, yTitle]);
  return <div className="chart"><canvas ref={canvas} role="img" aria-label={label} /></div>;
}
