import { CircuitElm } from './CircuitElm'
import { PipeElm } from './PipeElm'
import { SourceElm } from './SourceElm'
import { SprinklerElm } from './SprinklerElm'
import { PumpElm } from './PumpElm'
import { ValveElm } from './ValveElm'
import { ManifoldElm } from './ManifoldElm'
import { ReducerElm } from './ReducerElm'
import { FilterElm } from './FilterElm'
import { PRVElm } from './PRVElm'
import { LumoValveElm } from './LumoValveElm'
import { BoosterPumpElm } from './BoosterPumpElm'
import { TankElm } from './TankElm'
import { getImage, isReady } from './ImageLoader'

export interface ElementTypeDef {
  id: string
  label: string
  xmlTag: string
  /** Draw a small preview icon into a canvas context of size w×h.
   *  Call onLoad() if an async image load is needed to complete the icon. */
  drawIcon: (ctx: CanvasRenderingContext2D, w: number, h: number, onLoad?: () => void) => void
  /** Create a fresh element at the start point (x2=x, y2=y initially) */
  create: (x: number, y: number) => CircuitElm
  /** Reconstruct an element from an XML element (includes position + attributes) */
  fromXml: (elem: Element) => CircuitElm
}

function svgIcon(src: string) {
  return function drawIcon(ctx: CanvasRenderingContext2D, w: number, h: number, onLoad?: () => void) {
    const img = getImage(src, onLoad)
    if (isReady(img)) {
      ctx.drawImage(img, 2, 2, w - 4, h - 4)
    }
  }
}

export const ELEMENT_TYPES: ElementTypeDef[] = [
  {
    id: 'pipe',
    label: 'Pipe',
    xmlTag: 'pp',
    fromXml: (elem) => PipeElm.fromXml(elem),
    drawIcon(ctx, w, h) {
      ctx.strokeStyle = '#4da6ff'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(4, h / 2)
      ctx.lineTo(w - 4, h / 2)
      ctx.stroke()
      for (const x of [4, w - 4]) {
        ctx.beginPath()
        ctx.arc(x, h / 2, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#4da6ff'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    },
    create: (x, y) => new PipeElm(x, y),
  },
  {
    id: 'source',
    label: 'Source',
    xmlTag: 'src',
    fromXml: (elem) => SourceElm.fromXml(elem),
    drawIcon(ctx, w, h, onLoad) {
      ctx.strokeStyle = '#4da6ff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(w / 2, h * 0.55)
      ctx.lineTo(w / 2, h - 3)
      ctx.stroke()
      const img = getImage('/source-icon.svg', onLoad)
      if (isReady(img)) {
        const aspect = img.naturalWidth / img.naturalHeight
        const ih = h * 0.5
        const iw = ih * aspect
        ctx.drawImage(img, w / 2 - iw / 2, 2, iw, ih)
      }
    },
    create: (x, y) => new SourceElm(x, y),
  },
  {
    id: 'sprinkler',
    label: 'Sprinkler',
    xmlTag: 'sp',
    fromXml: (elem) => SprinklerElm.fromXml(elem),
    drawIcon(ctx, w, h, onLoad) {
      ctx.strokeStyle = '#4da6ff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(w / 2, h * 0.45)
      ctx.lineTo(w / 2, h - 3)
      ctx.stroke()
      const img = getImage('/sprinkler.png', onLoad)
      if (isReady(img)) {
        const aspect = img.naturalWidth / img.naturalHeight
        const ih = h * 0.5
        const iw = ih * aspect
        ctx.drawImage(img, w / 2 - iw / 2, 2, iw, ih)
      }
    },
    create: (x, y) => new SprinklerElm(x, y),
  },
  {
    id: 'pump',
    label: 'Pump',
    xmlTag: 'pu',
    fromXml: (elem) => PumpElm.fromXml(elem),
    drawIcon(ctx, w, h, onLoad) {
      const img = getImage('/Pump-Electrical.png', onLoad)
      if (isReady(img)) ctx.drawImage(img, 2, 2, w - 4, h - 4)
    },
    create: (x, y) => new PumpElm(x, y),
  },
  {
    id: 'valve',
    label: 'Valve',
    xmlTag: 'vl',
    fromXml: (elem) => ValveElm.fromXml(elem),
    drawIcon(ctx, w, h, onLoad) {
      const img = getImage('/valve.png', onLoad)
      if (isReady(img)) ctx.drawImage(img, 2, 2, w - 4, h - 4)
    },
    create: (x, y) => new ValveElm(x, y),
  },
  {
    id: 'manifold',
    label: 'Manifold',
    xmlTag: 'mn',
    fromXml: (elem) => ManifoldElm.fromXml(elem),
    drawIcon: svgIcon('/manifold-icon.svg'),
    create: (x, y) => new ManifoldElm(x, y),
  },
  {
    id: 'reducer',
    label: 'Reducer',
    xmlTag: 'rd',
    fromXml: (elem) => ReducerElm.fromXml(elem),
    drawIcon: svgIcon('/reducer-icon.svg'),
    create: (x, y) => new ReducerElm(x, y),
  },
  {
    id: 'filter',
    label: 'Filter',
    xmlTag: 'fi',
    fromXml: (elem) => FilterElm.fromXml(elem),
    drawIcon: svgIcon('/filter-icon.svg'),
    create: (x, y) => new FilterElm(x, y),
  },
  {
    id: 'prv',
    label: 'PRV',
    xmlTag: 'prv',
    fromXml: (elem) => PRVElm.fromXml(elem),
    drawIcon: svgIcon('/prv-icon.svg'),
    create: (x, y) => new PRVElm(x, y),
  },
  {
    id: 'lumo-valve',
    label: 'Lumo Valve',
    xmlTag: 'lv',
    fromXml: (elem) => LumoValveElm.fromXml(elem),
    drawIcon: svgIcon('/valve-icon.svg'),
    create: (x, y) => new LumoValveElm(x, y),
  },
  {
    id: 'booster-pump',
    label: 'Booster Pump',
    xmlTag: 'bp',
    fromXml: (elem) => BoosterPumpElm.fromXml(elem),
    drawIcon: svgIcon('/pump-icon.svg'),
    create: (x, y) => new BoosterPumpElm(x, y),
  },
  {
    id: 'tank',
    label: 'Tank',
    xmlTag: 'tk',
    fromXml: (elem) => TankElm.fromXml(elem),
    drawIcon(ctx, w, h, onLoad) {
      const img = getImage('/Tank.png', onLoad)
      if (isReady(img)) ctx.drawImage(img, 2, 2, w - 4, h - 4)
    },
    create: (x, y) => new TankElm(x, y),
  },
]

export const ELEMENT_TYPE_MAP = new Map(ELEMENT_TYPES.map(t => [t.id, t]))
// keyed by XML tag for deserialisation
export const ELEMENT_XML_TAG_MAP = new Map(ELEMENT_TYPES.map(t => [t.xmlTag, t]))
