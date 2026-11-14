/* =============================================================
   Gráficas ligeras en SVG (sin dependencias externas)
   - combo(): barras (litros) + línea (rendimiento km/L)
   ============================================================= */
window.DieselCharts = (function () {
  'use strict';

  const registry = new Map();
  let resizeTimer = null;

  function fmt(n, d) {
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toLocaleString('es-MX', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const exp = Math.floor(Math.log10(v));
    const base = Math.pow(10, exp);
    const f = v / base;
    const mult = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return mult * base;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function combo(el, opts) {
    if (!el) return;
    registry.set(el, opts);
    draw(el, opts);
  }

  function draw(el, opts) {
    const width = Math.max(300, Math.floor(el.clientWidth || (el.parentElement && el.parentElement.clientWidth) || 700));
    const compact = width < 460;
    const H = opts.height || (compact ? 220 : 260);
    const labels = opts.labels || [];
    const bars = opts.bars || [];
    const line = opts.line || [];
    const barUnit = opts.barUnit || 'L';
    const lineUnit = opts.lineUnit || 'L';
    const n = labels.length;

    const hasBars = bars.some((v) => v != null && isFinite(v) && v > 0);
    const hasLine = line.some((v) => v != null && isFinite(v) && v > 0);
    if (!n || (!hasBars && !hasLine)) {
      el.innerHTML = '<div class="empty-chart">Sin datos suficientes para graficar en el periodo seleccionado.</div>';
      return;
    }

    const pad = {
      l: compact ? 34 : 46,
      r: hasLine ? (compact ? 34 : 48) : 14,
      t: 14,
      b: compact ? 26 : 30
    };
    const iw = width - pad.l - pad.r;
    const ih = H - pad.t - pad.b;

    const maxBar = hasBars ? niceMax(Math.max.apply(null, bars.filter((v) => v > 0)) * 1.06) : 0;
    const maxLine = hasLine ? niceMax(Math.max.apply(null, line.filter((v) => v > 0)) * 1.15) : 0;

    const yBar = (v) => pad.t + ih - (v / (maxBar || 1)) * ih;
    const yLine = (v) => pad.t + ih - (v / (maxLine || 1)) * ih;
    const step = iw / n;
    const xAt = (i) => pad.l + step * (i + 0.5);

    const parts = [];
    parts.push('<svg class="chart" width="' + width + '" height="' + H + '" viewBox="0 0 ' + width + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Gráfica del periodo') + '">');

    // Rejilla + eje izquierdo (litros)
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const y = pad.t + (ih / ticks) * i;
      const val = maxBar * (1 - i / ticks);
      parts.push('<line class="grid-line" x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (pad.l + iw) + '" y2="' + y.toFixed(1) + '"/>');
      if (hasBars) {
        parts.push('<text x="' + (pad.l - 7) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + fmt(val, 0) + '</text>');
      }
    }

    // Eje derecho (segunda serie)
    if (hasLine) {
      for (let i = 0; i <= ticks; i++) {
        const y = pad.t + (ih / ticks) * i;
        const val = maxLine * (1 - i / ticks);
        parts.push('<text x="' + (pad.l + iw + 7) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="start">' + fmt(val, 1) + '</text>');
      }
    }

    // Barras
    if (hasBars) {
      const bw = Math.max(2, Math.min(compact ? 14 : 22, step * 0.62));
      bars.forEach((v, i) => {
        if (!(v > 0)) return;
        const x = xAt(i) - bw / 2;
        const y = yBar(v);
        const h = Math.max(1, pad.t + ih - y);
        parts.push('<rect class="bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(3, bw / 2) + '">' +
          '<title>' + esc(labels[i] + ' · ' + fmt(v, 1) + ' ' + barUnit) + '</title></rect>');
      });
    }

    // Línea de rendimiento
    if (hasLine) {
      let segment = [];
      const flush = () => {
        if (segment.length > 1) {
          parts.push('<path class="line-path" d="' + segment.join(' ') + '"/>');
        }
        segment = [];
      };
      line.forEach((v, i) => {
        if (v == null || !isFinite(v) || v <= 0) { flush(); return; }
        segment.push((segment.length ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yLine(v).toFixed(1));
        parts.push('<circle class="line-dot" cx="' + xAt(i).toFixed(1) + '" cy="' + yLine(v).toFixed(1) + '" r="2.4">' +
          '<title>' + esc(labels[i] + ' · ' + fmt(v, 2) + ' ' + lineUnit) + '</title></circle>');
      });
      flush();
    }

    // Etiquetas X
    const maxLabels = compact ? 5 : 9;
    const stepLabel = Math.max(1, Math.ceil(n / maxLabels));
    labels.forEach((lb, i) => {
      if (i % stepLabel !== 0 && i !== n - 1) return;
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      const x = i === 0 ? pad.l : i === n - 1 ? pad.l + iw : xAt(i);
      parts.push('<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + anchor + '">' + esc(lb) + '</text>');
    });

    parts.push('<line class="axis-line" x1="' + pad.l + '" y1="' + (pad.t + ih) + '" x2="' + (pad.l + iw) + '" y2="' + (pad.t + ih) + '"/>');
    parts.push('</svg>');
    el.innerHTML = parts.join('');
  }

  /* ------------------------------ barras horizontales (ranking) ------------------------------ */

  function barh(el, opts) {
    if (!el) return;
    registry.set(el, { _type: 'barh', opts: opts });
    drawBarh(el, opts);
  }

  function drawBarh(el, opts) {
    const width = Math.max(280, Math.floor(el.clientWidth || (el.parentElement && el.parentElement.clientWidth) || 600));
    const labels = opts.labels || [];
    const values = opts.values || [];
    const unit = opts.unit || 'L';
    const n = labels.length;
    const max = Math.max.apply(null, values.filter((v) => isFinite(v) && v > 0).concat([0]));
    if (!n || !(max > 0)) {
      el.innerHTML = '<div class="empty-chart">Sin datos suficientes para graficar.</div>';
      return;
    }
    const compact = width < 420;
    const pad = { l: compact ? 90 : 140, r: compact ? 46 : 64, t: 10, b: 10 };
    const rowH = compact ? 24 : 28;
    const barH = compact ? 12 : 14;
    const H = pad.t + pad.b + n * rowH;
    const iw = width - pad.l - pad.r;
    const colors = opts.colors || ['#f59e0b', '#0ea5e9', '#22c55e', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#6366f1'];
    const parts = [];
    parts.push('<svg class="chart chart-barh" width="' + width + '" height="' + H + '" viewBox="0 0 ' + width + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Gráfica') + '">');
    values.forEach((v, i) => {
      const y = pad.t + i * rowH + rowH / 2;
      const w = max > 0 ? (Math.max(0, v) / max) * iw : 0;
      const color = colors[i % colors.length];
      parts.push('<text x="' + (pad.l - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(String(labels[i]).slice(0, compact ? 14 : 22)) + '</text>');
      parts.push('<rect class="barh-track" x="' + pad.l + '" y="' + (y - barH / 2) + '" width="' + iw + '" height="' + barH + '" rx="5" fill="var(--surface-2)"/>');
      if (w > 0) {
        parts.push('<rect class="barh-fill" x="' + pad.l + '" y="' + (y - barH / 2) + '" width="' + w.toFixed(1) + '" height="' + barH + '" rx="5" fill="' + color + '">' +
          '<title>' + esc(labels[i] + ' · ' + fmt(v, 1) + ' ' + unit) + '</title></rect>');
      }
      parts.push('<text x="' + (pad.l + iw + 6) + '" y="' + (y + 4) + '" text-anchor="start" font-weight="600">' + esc(fmt(v, 1) + ' ' + unit) + '</text>');
    });
    parts.push('</svg>');
    el.innerHTML = parts.join('');
  }

  /* ------------------------------ dona (distribución) ------------------------------ */

  function donut(el, opts) {
    if (!el) return;
    registry.set(el, { _type: 'donut', opts: opts });
    drawDonut(el, opts);
  }

  function drawDonut(el, opts) {
    const width = Math.max(260, Math.floor(el.clientWidth || (el.parentElement && el.parentElement.clientWidth) || 420));
    const labels = opts.labels || [];
    const values = (opts.values || []).map((v) => (isFinite(v) && v > 0 ? Number(v) : 0));
    const unit = opts.unit || 'L';
    const total = values.reduce((a, b) => a + b, 0);
    if (!labels.length || !(total > 0)) {
      el.innerHTML = '<div class="empty-chart">Sin datos suficientes para graficar.</div>';
      return;
    }
    const colors = opts.colors || ['#f59e0b', '#0ea5e9', '#22c55e', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308', '#6366f1', '#f97316', '#06b6d4'];
    const compact = width < 380;
    const size = compact ? Math.min(width - 20, 180) : 200;
    const cx = size / 2, cy = size / 2, r = size / 2 - 8, ir = r * 0.58;
    let angle = -Math.PI / 2;
    const segs = [];
    values.forEach((v, i) => {
      if (!(v > 0)) return;
      const a = (v / total) * Math.PI * 2;
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(angle + a), y2 = cy + r * Math.sin(angle + a);
      const ix1 = cx + ir * Math.cos(angle + a), iy1 = cy + ir * Math.sin(angle + a);
      const ix2 = cx + ir * Math.cos(angle), iy2 = cy + ir * Math.sin(angle);
      const large = a > Math.PI ? 1 : 0;
      const d = 'M ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
        ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) +
        ' L ' + ix1.toFixed(2) + ' ' + iy1.toFixed(2) +
        ' A ' + ir + ' ' + ir + ' 0 ' + large + ' 0 ' + ix2.toFixed(2) + ' ' + iy2.toFixed(2) + ' Z';
      segs.push({ d: d, color: colors[i % colors.length], label: labels[i], value: v, pct: (v / total) * 100 });
      angle += a;
    });

    const H = compact ? size + 10 + segs.length * 20 : size;
    const parts = [];
    parts.push('<svg class="chart chart-donut" width="' + width + '" height="' + H + '" viewBox="0 0 ' + width + ' ' + H + '" role="img" aria-label="' + esc(opts.aria || 'Distribución') + '">');
    const ox = compact ? (width - size) / 2 : 10;
    const oy = 0;
    parts.push('<g transform="translate(' + ox.toFixed(1) + ',' + oy + ')">');
    segs.forEach((s) => {
      parts.push('<path d="' + s.d + '" fill="' + s.color + '" stroke="var(--surface)" stroke-width="2">' +
        '<title>' + esc(s.label + ' · ' + fmt(s.value, 1) + ' ' + unit + ' (' + fmt(s.pct, 1) + '%)') + '</title></path>');
    });
    parts.push('<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" font-size="11" fill="var(--muted)">Total</text>');
    parts.push('<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" font-size="15" font-weight="700" fill="var(--ink)">' + esc(fmt(total, 0)) + '</text>');
    parts.push('</g>');

    const lx = compact ? 10 : size + 28;
    const ly = compact ? size + 16 : 24;
    segs.slice(0, 8).forEach((s, i) => {
      const y = compact ? ly + i * 20 : ly + i * 22;
      parts.push('<rect x="' + lx + '" y="' + (y - 9) + '" width="10" height="10" rx="3" fill="' + s.color + '"/>');
      parts.push('<text x="' + (lx + 16) + '" y="' + y + '" font-size="11.5" fill="var(--ink-2)">' + esc(String(s.label).slice(0, 18) + ' · ' + fmt(s.pct, 1) + '%') + '</text>');
    });
    parts.push('</svg>');
    el.innerHTML = parts.join('');
  }

  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      registry.forEach(function (entry, el) {
        if (!el.isConnected) { registry.delete(el); return; }
        if (entry && entry._type === 'barh') drawBarh(el, entry.opts);
        else if (entry && entry._type === 'donut') drawDonut(el, entry.opts);
        else draw(el, entry);
      });
    }, 180);
  });

  return { combo: combo, barh: barh, donut: donut, fmt: fmt };
})();
