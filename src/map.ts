import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Verdict } from './game';

export interface AreaProps {
  id: string;
  name: string;
  nameEn: string;
  guide: boolean;
  small: boolean;
  center: [number, number];
}

type AreaState = 'idle' | 'selected' | 'ok' | 'missed' | 'wrong' | 'optional' | 'optional-picked';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function stateStyle(state: AreaState): L.PathOptions {
  const fill = {
    idle: css('--land'),
    selected: css('--pick'),
    ok: css('--ok'),
    missed: css('--missed'),
    wrong: css('--wrong'),
    optional: css('--optional'),
    'optional-picked': css('--optional'),
  }[state];
  return {
    fillColor: fill,
    fillOpacity: 1,
    color: state === 'idle' ? css('--border') : css('--border-strong'),
    weight: state === 'idle' ? 0.6 : 1.2,
  };
}

export class AreaMap {
  private map: L.Map;
  private layers = new Map<string, L.Path[]>();
  private states = new Map<string, AreaState>();
  readonly areas = new Map<string, AreaProps>();
  private locked = false;
  onToggle: (id: string) => void = () => {};

  constructor(el: HTMLElement, geo: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, AreaProps>) {
    const renderer = L.canvas({ padding: 0.5, tolerance: 4 });
    this.map = L.map(el, {
      renderer,
      zoomSnap: 0.25,
      minZoom: 1,
      maxZoom: 9,
      worldCopyJump: false,
      maxBounds: [
        [-80, -200],
        [86, 200],
      ],
      maxBoundsViscosity: 0.8,
      attributionControl: false,
    });
    // The view must be set before vector layers are added to a canvas renderer.
    this.resetView();

    const polygons = L.geoJSON(geo, {
      style: () => stateStyle('idle'),
      onEachFeature: (feature, layer) => this.register(feature.properties, layer as L.Path),
    });
    polygons.addTo(this.map);

    // Small areas get a dot that stays clickable at any zoom.
    for (const f of geo.features) {
      const p = f.properties;
      if (!p.small) continue;
      const dot = L.circleMarker([p.center[1], p.center[0]], { radius: 5, ...stateStyle('idle'), weight: 1 });
      dot.addTo(this.map);
      this.register(p, dot);
    }
  }

  private register(p: AreaProps, layer: L.Path) {
    this.areas.set(p.id, p);
    this.states.set(p.id, 'idle');
    if (!this.layers.has(p.id)) this.layers.set(p.id, []);
    this.layers.get(p.id)!.push(layer);
    layer.bindTooltip(p.name, { sticky: true, direction: 'top', className: 'area-tip' });
    layer.on('click', () => {
      if (!this.locked) this.onToggle(p.id);
    });
  }

  private paint(id: string, state: AreaState) {
    this.states.set(id, state);
    for (const layer of this.layers.get(id) ?? []) {
      layer.setStyle(stateStyle(state));
      if (state !== 'idle') layer.bringToFront();
    }
  }

  /** Shows the current selection while the player is answering. */
  showSelection(selected: Set<string>) {
    this.locked = false;
    for (const [id, state] of this.states) {
      const want: AreaState = selected.has(id) ? 'selected' : 'idle';
      if (state !== want) this.paint(id, want);
    }
  }

  /** Colors the map with the result and zooms to the relevant areas. */
  showVerdict(v: Verdict, selected: Set<string>) {
    this.locked = true;
    for (const id of this.states.keys()) this.paint(id, 'idle');
    for (const id of v.optional) this.paint(id, selected.has(id) ? 'optional-picked' : 'optional');
    for (const id of v.hit) this.paint(id, 'ok');
    for (const id of v.missed) this.paint(id, 'missed');
    for (const id of v.wrong) this.paint(id, 'wrong');

    const bounds = L.latLngBounds([]);
    // Optional areas are only colored: a big one (e.g. Russia) shouldn't dictate the zoom.
    for (const id of [...v.hit, ...v.missed, ...v.wrong]) {
      for (const layer of this.layers.get(id) ?? []) {
        if (layer instanceof L.CircleMarker) bounds.extend(layer.getLatLng());
        else if (layer instanceof L.Polygon) bounds.extend(this.mainBounds(layer));
      }
    }
    if (bounds.isValid()) this.map.flyToBounds(bounds.pad(0.3), { maxZoom: 5, duration: 0.6 });
  }

  /**
   * Bounds of the largest polygon of a multipolygon layer, so that far-away
   * islands (e.g. a country's overseas territories) don't zoom the map out.
   */
  private mainBounds(layer: L.Polygon): L.LatLngBounds {
    // Polygon: [ring][point], MultiPolygon: [polygon][ring][point]
    const raw = layer.getLatLngs() as L.LatLng[][] | L.LatLng[][][];
    const polys = (L.LineUtil.isFlat(raw[0] as L.LatLng[]) ? [raw] : raw) as L.LatLng[][][];
    let best: L.LatLngBounds | null = null;
    let bestArea = -1;
    for (const poly of polys) {
      const b = L.latLngBounds(poly[0]);
      const area = (b.getEast() - b.getWest()) * (b.getNorth() - b.getSouth());
      if (area > bestArea) [best, bestArea] = [b, area];
    }
    return best ?? layer.getBounds();
  }

  flyTo(id: string) {
    const layer = this.layers.get(id)?.[0];
    if (!layer) return;
    if (layer instanceof L.CircleMarker) this.map.flyTo(layer.getLatLng(), Math.max(this.map.getZoom(), 5), { duration: 0.5 });
    else if (layer instanceof L.Polygon) this.map.flyToBounds(this.mainBounds(layer).pad(0.5), { maxZoom: 6, duration: 0.5 });
  }

  resetView() {
    this.map.fitBounds([
      [-56, -170],
      [75, 180],
    ]);
  }

  invalidate() {
    this.map.invalidateSize();
  }
}
