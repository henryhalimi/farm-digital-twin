import { CircuitElm } from './CircuitElm'
import { PipeElm } from './PipeElm'
import { SprinklerElm } from './SprinklerElm'
import { PumpElm } from './PumpElm'
import { ValveElm } from './ValveElm'
import { ManifoldElm } from './ManifoldElm'
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
  drawIcon: (ctx: CanvasRenderingContext2D, w: number, h: number, onLoad?: () => void) => void
  create: (x: number, y: number) => CircuitElm
  fromXml: (elem: Element) => CircuitElm
}

function svgIcon(src: string, fallback: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  return function drawIcon(ctx: CanvasRenderingContext2D, w: number, h: number, onLoad?: () => void) {
    const img = getImage(src, onLoad)
    if (isReady(img)) {
      ctx.drawImage(img, 2, 2, w - 4, h - 4)
    } else {
      fallback(ctx, w, h)
    }
  }
}

function drawCircle(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, label: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.min(w, h) * 0.35}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, w / 2, h / 2)
}

function drawRect(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, label: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(2, 2, w - 4, h - 4, 3)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.min(w, h) * 0.3}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, w / 2, h / 2)
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
      }
    },
    create: (x, y) => new PipeElm(x, y),
  },
  {
    id: 'pump',
    label: 'Pump',
    xmlTag: 'pu',
    fromXml: (elem) => PumpElm.fromXml(elem),
    drawIcon(ctx, w, h, onLoad) {
      const img = getImage('/Pump-Electrical.png', onLoad)
      if (isReady(img)) { ctx.drawImage(img, 2, 2, w - 4, h - 4) }
      else { drawCircle(ctx, w, h, '#2266cc', 'P') }
    },
    create: (x, y) => new PumpElm(x, y),
  },
  {
    id: 'booster-pump',
    label: 'Booster Pump',
    xmlTag: 'bp',
    fromXml: (elem) => BoosterPumpElm.fromXml(elem),
    drawIcon: svgIcon('/pump-icon.svg', (ctx, w, h) => drawCircle(ctx, w, h, '#1a4a99', 'BP')),
    create: (x, y) => new BoosterPumpElm(x, y),
  },
  {
    id: 'tank',
    label: 'Tank',
    xmlTag: 'tk',
    fromXml: (elem) => TankElm.fromXml(elem),
    drawIcon(ctx, w, h, onLoad) {
      const img = getImage('/Tank.png', onLoad)
      if (isReady(img)) { ctx.drawImage(img, 2, 2, w - 4, h - 4) }
      else { drawRect(ctx, w, h, '#336699', 'TK') }
    },
    create: (x, y) => new TankElm(x, y),
  },
  {
    id: 'valve',
    label: 'Valve',
    xmlTag: 'vl',
    fromXml: (elem) => ValveElm.fromXml(elem),
    drawIcon(ctx, w, h, onLoad) {
      const img = getImage('/valve.png', onLoad)
      if (isReady(img)) { ctx.drawImage(img, 2, 2, w - 4, h - 4) }
      else { drawRect(ctx, w, h, '#cc6600', 'V') }
    },
    create: (x, y) => new ValveElm(x, y),
  },
  {
    id: 'lumo-valve',
    label: 'Lumo Valve',
    xmlTag: 'lv',
    fromXml: (elem) => LumoValveElm.fromXml(elem),
    drawIcon: svgIcon('/valve-icon.svg', (ctx, w, h) => drawRect(ctx, w, h, '#22aa44', 'LV')),
    create: (x, y) => new LumoValveElm(x, y),
  },
  {
    id: 'manifold',
    label: 'Manifold',
    xmlTag: 'mn',
    fromXml: (elem) => ManifoldElm.fromXml(elem),
    drawIcon: svgIcon('/manifold-icon.svg', (ctx, w, h) => drawRect(ctx, w, h, '#aa4422', 'MF')),
    create: (x, y) => new ManifoldElm(x, y),
  },
  {
    id: 'filter',
    label: 'Filter',
    xmlTag: 'fi',
    fromXml: (elem) => FilterElm.fromXml(elem),
    drawIcon: svgIcon('/filter-icon.svg', (ctx, w, h) => drawRect(ctx, w, h, '#886600', 'FI')),
    create: (x, y) => new FilterElm(x, y),
  },
  {
    id: 'prv',
    label: 'PRV',
    xmlTag: 'prv',
    fromXml: (elem) => PRVElm.fromXml(elem),
    drawIcon: svgIcon('/prv-icon.svg', (ctx, w, h) => drawRect(ctx, w, h, '#884400', 'PRV')),
    create: (x, y) => new PRVElm(x, y),
  },
  {
    id: 'sprinkler',
    label: 'Sprinkler',
    xmlTag: 'sp',
    fromXml: (elem) => SprinklerElm.fromXml(elem),
    drawIcon(ctx, w, h, onLoad) {
      const img = getImage('/sprinkler.png', onLoad)
      if (isReady(img)) { ctx.drawImage(img, 2, 2, w - 4, h - 4) }
      else { drawCircle(ctx, w, h, '#0088cc', 'SP') }
    },
    create: (x, y) => new SprinklerElm(x, y),
  },
  {
    id: 'pipe-cap',
    label: 'Pipe Cap',
    xmlTag: 'cc',
    fromXml: (elem) => {
      const x = parseInt(elem.getAttribute('x1') ?? '0')
      const y = parseInt(elem.getAttribute('y1') ?? '0')
      return new SprinklerElm(x, y)
    },
    drawIcon(ctx, w, h) {
      ctx.fillStyle = '#555'
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, Math.min(w, h) / 2 - 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${Math.min(w, h) * 0.28}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('CAP', w / 2, h / 2)
    },
    create: (x, y) => new SprinklerElm(x, y),
  },
]

export const ELEMENT_TYPE_MAP = new Map(ELEMENT_TYPES.map(t => [t.id, t]))
export const ELEMENT_XML_TAG_MAP = new Map(ELEMENT_TYPES.map(t => [t.xmlTag, t]))
