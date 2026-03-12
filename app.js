/* ── Configuración ── */
const PMTILES_FILE     = 'healthcare_h3_r6.pmtiles';
const PMTILES_FILE_LOW = 'healthcare_h3_r4.pmtiles';

const INITIAL_CENTER = [10, 52];
const INITIAL_ZOOM   = 3;

/* Cortes (minutos) y paleta verde → rojo */
const BREAKS = [10, 20, 30, 45, 60, 90, 120];
const COLORS  = ['#006837', '#1a9641', '#66bd63', '#a6d96a', '#fee08b', '#fdae61', '#f46d43', '#d73027'];

const LABEL_TEXTS = ['< 10', '10', '20', '30', '45', '60', '90', '≥ 120'];

/* ── Utilidades ── */
function fmtMin(v) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return '—';
  if (n >= 60) {
    const h = Math.floor(n / 60);
    const m = Math.round(n % 60);
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(n)} min`;
}

/* ── Expresión de color MapLibre ── */
function fillColorExpr() {
  return ['step', ['to-number', ['get', 'n1_min'], 0],
    COLORS[0],
    BREAKS[0], COLORS[1],
    BREAKS[1], COLORS[2],
    BREAKS[2], COLORS[3],
    BREAKS[3], COLORS[4],
    BREAKS[4], COLORS[5],
    BREAKS[5], COLORS[6],
    BREAKS[6], COLORS[7]
  ];
}

/* ── Leyenda ── */
function buildLegend() {
  const sw  = document.getElementById('legend-swatches');
  const lab = document.getElementById('legend-labels');
  sw.innerHTML = '';
  lab.innerHTML = '';

  COLORS.forEach(color => {
    const el = document.createElement('div');
    el.className = 'sw';
    el.style.background = color;
    sw.appendChild(el);
  });

  LABEL_TEXTS.forEach(txt => {
    const s = document.createElement('span');
    s.textContent = txt;
    lab.appendChild(s);
  });
}

/* ── Mapa ── */
const map = new maplibregl.Map({
  container: 'map',
  style: { version: 8, sources: {}, layers: [] },
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
  minZoom: 2,
  antialias: true
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');

/* ── Carga del mapa ── */
map.on('load', async () => {
  /* Mapa base */
  map.addSource('basemap', {
    type: 'raster',
    tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}{r}.png'],
    tileSize: 256,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
  });
  map.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' });

  /* Protocolo PMTiles */
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile.bind(protocol));

  /* En file:// no hay Range requests: cargamos los archivos enteros en memoria */
  if (location.protocol === 'file:') {
    const cargar = async (file) => {
      const buf = await fetch(file).then(r => r.arrayBuffer());
      protocol.add(new pmtiles.PMTiles({
        getBytes: (off, len) => Promise.resolve({ data: buf.slice(off, off + len) }),
        getKey:   () => file
      }));
    };
    await Promise.all([cargar(PMTILES_FILE), cargar(PMTILES_FILE_LOW)]);
  }

  /* Fuentes vectoriales — rutas relativas, funcionan tanto en local como en GH Pages */
  map.addSource('healthcare', {
    type: 'vector',
    url: `pmtiles://${PMTILES_FILE}`
  });
  map.addSource('healthcare-low', {
    type: 'vector',
    url: `pmtiles://${PMTILES_FILE_LOW}`
  });

  const FILL_PAINT = {
    'fill-color': fillColorExpr(),
    'fill-opacity': 0.75,
    'fill-outline-color': [
      'interpolate', ['linear'], ['zoom'],
      4, 'rgba(0,0,0,0.0)',
      6, 'rgba(0,0,0,0.08)'
    ]
  };

  /* Capa zoom < 6: hexágonos gruesos (h3_h4) */
  map.addLayer({
    id: 'healthcare-fill-low',
    type: 'fill',
    source: 'healthcare-low',
    'source-layer': 'healthcare',
    maxzoom: 6,
    paint: FILL_PAINT
  });

  /* Capa zoom ≥ 6: hexágonos finos (h3) */
  map.addLayer({
    id: 'healthcare-fill',
    type: 'fill',
    source: 'healthcare',
    'source-layer': 'healthcare',
    minzoom: 6,
    paint: FILL_PAINT
  });

  buildLegend();

  /* Interacción: cursor */
  ['healthcare-fill-low', 'healthcare-fill'].forEach(id => {
    map.on('mousemove', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  });

  /* Interacción: popup */
  let popup;
  function onClickFill(e) {
    if (!e.features?.length) return;
    const props = e.features[0].properties || {};
    const mins  = parseFloat(props.n1_min);

    const html = `
      <div>
        <p class="pp-title">Tiempo al hospital más cercano</p>
        <div class="pp-time">${fmtMin(mins)}</div>
        <div class="pp-footer">${Number.isFinite(mins) ? mins.toFixed(1).replace('.', ',') + ' min exactos' : ''}</div>
      </div>`;

    if (!popup) {
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 8, maxWidth: '260px' });
    }
    popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
  }

  map.on('click', 'healthcare-fill-low', onClickFill);
  map.on('click', 'healthcare-fill',     onClickFill);
});
