// ============================================================
// i18n message catalog. Server-safe (no 'use client') so tanto el
// React Context client-side (lib/i18n.tsx) como helpers server-side
// (lib/i18n-server.ts) pueden importar de aquí.
//
// Conventions:
//   * Keys son strings dot-separated por sección: 'dash.nav.stats'.
//   * El idioma default es español (DEFAULT_LOCALE = 'es').
//   * Si una key falta en el dict actual, el helper t() devuelve la
//     key cruda — así las traducciones faltantes se ven visualmente
//     en la UI sin romper nada.
//   * Para interpolación usar `{name}` style: 'Hola {name}'. El render
//     del componente sustituye con un helper local (ver kiosk).
// ============================================================

import type { Locale } from './i18n-types'

type Messages = Record<string, string>

export const MESSAGES: Record<Locale, Messages> = {
  es: {
    // ── Landing nav ────────────────────────────────────────────
    'nav.manifesto': 'Manifiesto',
    'nav.product': 'Producto',
    'nav.how': 'Cómo funciona',
    'nav.login': 'Entrar',
    'nav.signup': 'Empieza gratis',

    // ── Landing hero ───────────────────────────────────────────
    'hero.overline': 'The next-up system · est. 2026',
    'hero.sub':
      'NXTUP es el sistema digital que reemplaza la pizarra de la barbería. Cada cliente sabe su turno. Cada barbero sabe el suyo. Nadie hace trampa.',
    'hero.cta': 'Probar con mi barbería',
    'hero.fact1.title': 'FIFO real',
    'hero.fact1.body': 'Orden de llegada, sin atajos',
    'hero.fact2.title': 'Anti-trampa',
    'hero.fact2.body': 'Disponible solo desde el WiFi del shop',
    'hero.fact3.title': 'Hardware opcional',
    'hero.fact3.body': 'El NXT TAP en cada estación',
    'hero.fact4.title': 'Bitácora',
    'hero.fact4.body': 'Cada acción queda registrada',

    // ── Landing manifesto ──────────────────────────────────────
    'manifesto.label': 'Manifiesto',
    'manifesto.body.1':
      'Borrones, "yo llegué primero", el barbero que mueve nombres cuando nadie ve, el cliente que se cansa de esperar y se va.',
    'manifesto.body.2':
      'Tu sistema actual no falla porque la gente sea mala. Falla porque depende de la memoria y la buena fe.',
    'manifesto.body.3':
      'NXTUP no reemplaza tu barbería. Arregla lo único que tu barbería no puede arreglar sola — el orden.',

    // ── Landing surfaces ───────────────────────────────────────
    'surfaces.label': 'Producto',
    'surfaces.client.kicker': 'Para el cliente',
    'surfaces.client.title': 'Check-in en 1 tap',
    'surfaces.client.body':
      'Escanea el QR de la entrada. Si hay barbero libre, le dice a quién ir. Si hay cola, le dice cuándo le toca. No necesita registrarse.',
    'surfaces.device.kicker': 'Para el barbero',
    'surfaces.device.title': 'NXT TAP físico',
    'surfaces.device.body':
      'Tres botones en su estación. DISPONIBLE, BUSY, BREAK. El sistema entero gira alrededor de quién tocó qué y cuándo.',
    'surfaces.tv.kicker': 'Para todos',
    'surfaces.tv.title': 'TV en vivo',
    'surfaces.tv.body':
      'La pantalla pública muestra el orden de los barberos y los clientes en cola. Imposible discutir cuando todos ven lo mismo.',

    // ── Landing how it works ───────────────────────────────────
    'how.label': 'Cómo funciona',
    'how.step1.title': 'Pega el QR en tu entrada',
    'how.step1.body':
      'Tomas el código de NXTUP, lo imprimes, lo pegas en la puerta. El cliente lo escanea desde su celular.',
    'how.step2.title': 'Cada barbero tiene su NXT TAP',
    'how.step2.body':
      'Un dispositivo en su estación. Tres botones para marcar Disponible, Busy, Break. Suficiente para ordenar todo el día.',
    'how.step3.title': 'La TV muestra la verdad',
    'how.step3.body':
      'En la pared del shop, en vivo: quién sigue, quién está cortando, cuánto falta. Cualquiera puede mirar.',

    // ── Landing final CTA ──────────────────────────────────────
    'cta.label': 'Listo para arrancar',
    'cta.sub':
      'Crea tu shop en 2 minutos. Sin tarjeta, sin compromiso. Pruébalo en tu próximo turno.',
    'cta.primary': 'Crear mi barbería',
    'cta.secondary': 'Ya tengo cuenta',

    // ── Landing footer ─────────────────────────────────────────
    'footer.console': 'Consola',

    // ── Visuals (SVG inline copy) ──────────────────────────────
    'visual.client.next': 'Eres el siguiente',

    // ── Locale switch ──────────────────────────────────────────
    'locale.switch': 'EN',
    'locale.switch.aria': 'Switch to English',

    // ── Install button (PWA) ───────────────────────────────────
    'install.button': 'Instalar app',
    'install.button.short': 'Instalar',
    'install.button.aria': 'Instalar NXTUP en este dispositivo',
    'install.ios.title': 'Instala NXTUP',
    'install.ios.step1': 'Toca el ícono Compartir',
    'install.ios.step1.detail': 'abajo de Safari',
    'install.ios.step2': 'Elige "Añadir a inicio"',
    'install.ios.step2.detail': 'a veces hay que bajar en el menú',
    'install.ios.step3': 'Toca "Añadir"',
    'install.ios.step3.detail': 'arriba a la derecha',
    'install.ios.outro': 'Listo — NXTUP queda como app en tu pantalla.',
    'install.ios.close': 'Entendido',
    'install.unsupported.title': 'Instalación no disponible',
    'install.unsupported.body':
      'Tu navegador no soporta instalar esta app. Prueba con Chrome, Edge o Safari.',

    // ── Kiosk Check-In ──────────────────────────────────────────
    'kiosk.welcome': 'Bienvenido',
    'kiosk.lang.es': 'Español',
    'kiosk.lang.en': 'English',

    // Status labels — usados en el PWA del barbero, ControlPanel del
    // dueño, TV display, panel de devices, activity feed, etc. La DB
    // sigue guardando `status='available'`; estos son solo los labels
    // visibles para humanos.
    'status.available': 'Disponible',
    'status.busy': 'Ocupado',
    'status.break': 'Descanso',
    'status.offline': 'Fuera',
    'status.available.upper': 'DISPONIBLE',

    // Barber device instructions (PWA del barbero, encima del botón
    // gigante AVAILABLE — ese label en sí queda en inglés siempre).
    'barber.tap.start': 'Toca AVAILABLE para iniciar turno',
    'barber.tap.done': 'Toca AVAILABLE al terminar',
    'barber.tap.return': 'Toca AVAILABLE al volver',

    'kiosk.header.waiting.zero': 'Sin cola · entra directo',
    'kiosk.header.waiting.one': '1 en cola · {min}-{max} min de espera',
    'kiosk.header.waiting.many': '{count} en cola · {min}-{max} min de espera',

    'kiosk.phone.title': 'Tu número de teléfono',
    'kiosk.phone.hint': 'Te buscaremos en nuestro sistema',
    'kiosk.phone.continue': 'Continuar',
    'kiosk.phone.invalid': 'Necesitamos 10 dígitos para continuar',

    'kiosk.back': 'Volver',
    'kiosk.step': 'Paso {n} de {total}',

    'kiosk.new.title': 'Cuéntanos un poco',
    'kiosk.new.firstName': 'Nombre',
    'kiosk.new.firstNamePlaceholder': 'Juan',
    'kiosk.new.source': '¿Cómo nos conociste?',
    'kiosk.new.continue': 'Continuar',

    'kiosk.returning.welcome': '¡Bienvenido de vuelta, {name}!',
    'kiosk.returning.visit.first': 'Tu primera visita registrada',
    'kiosk.returning.visit.many': 'Visita #{n} con nosotros',
    'kiosk.returning.continue': 'Continuar',

    'kiosk.source.walk-by': 'De pasada',
    'kiosk.source.google': 'Google',
    'kiosk.source.instagram': 'Instagram',
    'kiosk.source.tiktok': 'TikTok',
    'kiosk.source.friend': 'Un amigo',
    'kiosk.source.other': 'Otro',

    'kiosk.success.welcome': '¡Bienvenido, {name}!',
    'kiosk.success.welcomeBack': '¡Bienvenido de vuelta, {name}!',
    'kiosk.success.queued': 'Estás en la cola',
    'kiosk.success.position': 'Posición',
    'kiosk.success.eta': 'Espera estimada',
    'kiosk.success.min': 'min',
    'kiosk.success.relax':
      'Relájate, te llamamos cuando esté tu barbero.',
    'kiosk.success.done': 'Listo',
    'kiosk.success.goWith': 'Ve con {name}',
    'kiosk.success.goWithSub': 'Te está esperando ahora',
    'kiosk.success.inQueueHeader': 'En cola',
    'kiosk.success.you': 'Tú',
    'kiosk.success.statusCalled': 'Llamado',

    // ──────────────────────────────────────────────────────────
    // Dashboard del dueño + admin (agregado en el sweep i18n)
    // ──────────────────────────────────────────────────────────

    // Nav del dashboard del dueño
    'dash.nav.live': 'En vivo',
    'dash.nav.stats': 'Estadísticas',
    'dash.nav.barbers': 'Barberos',
    'dash.nav.activity': 'Actividad',
    'dash.nav.settings': 'Configuración',
    // Variantes cortas para el MobileTabBar (5 tabs en mobile, espacio
    // apretado — usamos labels más compactos).
    'dash.nav.short.live': 'En vivo',
    'dash.nav.short.stats': 'Stats',
    'dash.nav.short.barbers': 'Barberos',
    'dash.nav.short.activity': 'Actividad',
    'dash.nav.short.settings': 'Ajustes',
    'dash.nav.signout': 'Cerrar sesión',

    // Page headings del dashboard
    'dash.heading.stats': 'Estadísticas',
    'dash.heading.barbers': 'Barberos',
    'dash.heading.settings': 'Configuración',
    'dash.heading.activity': 'Actividad',
    'dash.heading.control': 'Centro de mando',

    // Status del shop (open/closed)
    'dash.shop.open': 'ABIERTO',
    'dash.shop.closed': 'CERRADO',
    'dash.shop.openShop': 'Abrir shop',
    'dash.shop.closeShop': 'Cerrar shop',
    'dash.shop.liveQueue': 'Cola en vivo',
    'dash.shop.noClients': 'No hay clientes en espera',
    'dash.shop.inQueueCount': '{count} en cola',
    'dash.shop.activeBarbers': '{count} barberos activos',

    // Status labels de los entries en cola
    'status.entry.waiting': 'Esperando',
    'status.entry.called': 'Llamado',
    'status.entry.inProgress': 'En silla',

    // Botones / labels comunes
    'common.copy': 'Copiar',
    'common.copied': 'Copiado',
    'common.share': 'Compartir',
    'common.manage': 'Administrar',
    'common.delete': 'Eliminar',
    'common.add': 'Agregar',
    'common.cancel': 'Cancelar',
    'common.apply': 'Aplicar',
    'common.clear': 'Limpiar',
    'common.back': 'Volver',
    'common.barbers': 'Barberos',
    'common.outOfQueue': 'Fuera de fila',
    'common.calling': 'Llamando',
    'common.attending': 'Atendiendo',

    // DisplayBoard (TV)
    'display.col.available': 'Disponibles',
    'display.col.busy': 'Ocupados',
    'display.col.break': 'Descanso',
    'display.shopClosed': 'Cerrado',

    // ControlPanel (Centro de Mando) buttons + banner
    'control.clearSanction': 'Levantar sanción',
    'control.restoreBreak': 'Devolver break',
    'control.sanctionedUntil': 'Sancionado hasta {time}',
    'control.restoreBreakHint': 'Tomó {n} break(s) hoy. Devuelve uno.',
    'control.errorNoBreaks': 'Ya no tiene breaks por devolver',
    'control.errorNetwork': 'Error de red',
    'control.errorClearSanction': 'No se pudo levantar la sanción',
    'control.errorRestoreBreak': 'No se pudo devolver el break',

    // Stats page
    'stats.print': 'Descargar PDF',
    'stats.range.from': 'Desde',
    'stats.range.to': 'Hasta',
    'stats.range.shortcuts': 'Atajos de rango',
    'stats.reload': 'Recarga para datos frescos.',
    'stats.lastUpdated': 'Última actualización',
    'stats.report': 'Reporte',
    'stats.generatedOn': 'Generado el {date}',

    // Admin sidebar
    'admin.nav.home': 'Inicio',
    'admin.nav.shops': 'Barberías',
    'admin.nav.stats': 'Estadísticas',
    'admin.nav.revenue': 'Ingresos',
    'admin.nav.team': 'Equipo',
    'admin.nav.activity': 'Actividad',
    'admin.nav.panelTokens': 'Tokens de panel',
    'admin.welcome': 'Bienvenido',
    'admin.exit': 'Salir',
    'admin.title.admin': 'Admin',
    'admin.title.panel': 'Panel',
    'admin.openMenu': 'Abrir menú',
    'admin.closeMenu': 'Cerrar menú',
    'admin.menuNav': 'Menú de navegación',
  },

  en: {
    // ── Landing nav ────────────────────────────────────────────
    'nav.manifesto': 'Manifesto',
    'nav.product': 'Product',
    'nav.how': 'How it works',
    'nav.login': 'Log in',
    'nav.signup': 'Get started',

    // ── Landing hero ───────────────────────────────────────────
    'hero.overline': 'The next-up system · est. 2026',
    'hero.sub':
      'NXTUP is the digital system that replaces the barbershop whiteboard. Every client knows their turn. Every barber knows theirs. Nobody cuts the line.',
    'hero.cta': 'Try it in my shop',
    'hero.fact1.title': 'Real FIFO',
    'hero.fact1.body': 'First in, first served. No shortcuts.',
    'hero.fact2.title': 'Anti-cheat',
    'hero.fact2.body': 'Only active from the shop WiFi',
    'hero.fact3.title': 'Optional hardware',
    'hero.fact3.body': 'The NXT TAP on every chair',
    'hero.fact4.title': 'Audit log',
    'hero.fact4.body': 'Every action recorded',

    // ── Landing manifesto ──────────────────────────────────────
    'manifesto.label': 'Manifesto',
    'manifesto.body.1':
      'Smudged names, "I was here first," the barber who rearranges the board when nobody\'s looking, the client who gives up and walks out.',
    'manifesto.body.2':
      'Your current system doesn\'t fail because people are bad. It fails because it relies on memory and goodwill.',
    'manifesto.body.3':
      'NXTUP doesn\'t replace your shop. It fixes the one thing your shop can\'t fix on its own — the order.',

    // ── Landing surfaces ───────────────────────────────────────
    'surfaces.label': 'Product',
    'surfaces.client.kicker': 'For the client',
    'surfaces.client.title': 'One-tap check-in',
    'surfaces.client.body':
      'Scan the QR at the door. If a barber is free, it tells them who. If there\'s a wait, it tells them when. No signup required.',
    'surfaces.device.kicker': 'For the barber',
    'surfaces.device.title': 'NXT TAP device',
    'surfaces.device.body':
      'Three buttons at every station: AVAILABLE, BUSY, BREAK. The whole system runs on who tapped what, when.',
    'surfaces.tv.kicker': 'For everyone',
    'surfaces.tv.title': 'Live TV display',
    'surfaces.tv.body':
      'The shop\'s public screen shows the barber lineup and the client queue in real time. Impossible to argue when everyone sees the same thing.',

    // ── Landing how it works ───────────────────────────────────
    'how.label': 'How it works',
    'how.step1.title': 'Print the QR by the door',
    'how.step1.body':
      'Grab your NXTUP code, print it, tape it to the entrance. Clients scan it with their phone.',
    'how.step2.title': 'Each barber gets a NXT TAP',
    'how.step2.body':
      'A device on every chair. Three buttons for Available, Busy, Break. Enough to run the whole day.',
    'how.step3.title': 'The TV tells the truth',
    'how.step3.body':
      'On the shop\'s wall, live: who\'s next, who\'s cutting, how long until your turn. Anyone can look.',

    // ── Landing final CTA ──────────────────────────────────────
    'cta.label': 'Ready to ship',
    'cta.sub':
      'Create your shop in 2 minutes. No credit card, no commitment. Try it on your next shift.',
    'cta.primary': 'Create my shop',
    'cta.secondary': 'I already have an account',

    // ── Landing footer ─────────────────────────────────────────
    'footer.console': 'Console',

    // ── Visuals (SVG inline copy) ──────────────────────────────
    'visual.client.next': "You're up next",

    // ── Locale switch ──────────────────────────────────────────
    'locale.switch': 'ES',
    'locale.switch.aria': 'Cambiar a español',

    // ── Install button (PWA) ───────────────────────────────────
    'install.button': 'Install app',
    'install.button.short': 'Install',
    'install.button.aria': 'Install NXTUP on this device',
    'install.ios.title': 'Install NXTUP',
    'install.ios.step1': 'Tap the Share icon',
    'install.ios.step1.detail': 'at the bottom of Safari',
    'install.ios.step2': 'Choose "Add to Home Screen"',
    'install.ios.step2.detail': 'you may need to scroll the menu',
    'install.ios.step3': 'Tap "Add"',
    'install.ios.step3.detail': 'top right corner',
    'install.ios.outro': 'Done — NXTUP now lives on your home screen.',
    'install.ios.close': 'Got it',
    'install.unsupported.title': 'Install not available',
    'install.unsupported.body':
      'Your browser doesn\'t support installing this app. Try Chrome, Edge or Safari.',

    // ── Kiosk Check-In ──────────────────────────────────────────
    'kiosk.welcome': 'Welcome',
    'kiosk.lang.es': 'Español',
    'kiosk.lang.en': 'English',

    'status.available': 'Available',
    'status.busy': 'Busy',
    'status.break': 'Break',
    'status.offline': 'Offline',
    'status.available.upper': 'AVAILABLE',

    'barber.tap.start': 'Tap AVAILABLE to start your shift',
    'barber.tap.done': 'Tap AVAILABLE when you finish',
    'barber.tap.return': 'Tap AVAILABLE when you return',

    'kiosk.header.waiting.zero': 'No queue · walk right in',
    'kiosk.header.waiting.one': '1 in queue · {min}-{max} min wait',
    'kiosk.header.waiting.many': '{count} in queue · {min}-{max} min wait',

    'kiosk.phone.title': 'Your phone number',
    'kiosk.phone.hint': 'We\'ll look you up in our system',
    'kiosk.phone.continue': 'Continue',
    'kiosk.phone.invalid': 'We need 10 digits to continue',

    'kiosk.back': 'Back',
    'kiosk.step': 'Step {n} of {total}',

    'kiosk.new.title': 'Tell us a bit about you',
    'kiosk.new.firstName': 'First name',
    'kiosk.new.firstNamePlaceholder': 'John',
    'kiosk.new.source': 'How did you hear about us?',
    'kiosk.new.continue': 'Continue',

    'kiosk.returning.welcome': 'Welcome back, {name}!',
    'kiosk.returning.visit.first': 'Your first recorded visit',
    'kiosk.returning.visit.many': 'Visit #{n} with us',
    'kiosk.returning.continue': 'Continue',

    'kiosk.source.walk-by': 'Walk-by',
    'kiosk.source.google': 'Google',
    'kiosk.source.instagram': 'Instagram',
    'kiosk.source.tiktok': 'TikTok',
    'kiosk.source.friend': 'Friend',
    'kiosk.source.other': 'Other',

    'kiosk.success.welcome': 'Welcome, {name}!',
    'kiosk.success.welcomeBack': 'Welcome back, {name}!',
    'kiosk.success.queued': 'You\'re in the queue',
    'kiosk.success.position': 'Position',
    'kiosk.success.eta': 'Estimated wait',
    'kiosk.success.min': 'min',
    'kiosk.success.relax':
      'Relax nearby. We\'ll call you when your barber is ready.',
    'kiosk.success.done': 'Done',
    'kiosk.success.goWith': 'Go to {name}',
    'kiosk.success.goWithSub': 'They\'re waiting for you now',
    'kiosk.success.inQueueHeader': 'In queue',
    'kiosk.success.you': 'You',
    'kiosk.success.statusCalled': 'Called',

    // ──────────────────────────────────────────────────────────
    // Owner dashboard + admin
    // ──────────────────────────────────────────────────────────

    'dash.nav.live': 'Live',
    'dash.nav.stats': 'Stats',
    'dash.nav.barbers': 'Barbers',
    'dash.nav.activity': 'Activity',
    'dash.nav.settings': 'Settings',
    'dash.nav.short.live': 'Live',
    'dash.nav.short.stats': 'Stats',
    'dash.nav.short.barbers': 'Barbers',
    'dash.nav.short.activity': 'Activity',
    'dash.nav.short.settings': 'Settings',
    'dash.nav.signout': 'Sign out',

    'dash.heading.stats': 'Stats',
    'dash.heading.barbers': 'Barbers',
    'dash.heading.settings': 'Settings',
    'dash.heading.activity': 'Activity',
    'dash.heading.control': 'Control Center',

    'dash.shop.open': 'OPEN',
    'dash.shop.closed': 'CLOSED',
    'dash.shop.openShop': 'Open shop',
    'dash.shop.closeShop': 'Close shop',
    'dash.shop.liveQueue': 'Live queue',
    'dash.shop.noClients': 'No clients waiting',
    'dash.shop.inQueueCount': '{count} in queue',
    'dash.shop.activeBarbers': '{count} active barbers',

    'status.entry.waiting': 'Waiting',
    'status.entry.called': 'Called',
    'status.entry.inProgress': 'In chair',

    'common.copy': 'Copy',
    'common.copied': 'Copied',
    'common.share': 'Share',
    'common.manage': 'Manage',
    'common.delete': 'Delete',
    'common.add': 'Add',
    'common.cancel': 'Cancel',
    'common.apply': 'Apply',
    'common.clear': 'Clear',
    'common.back': 'Back',
    'common.barbers': 'Barbers',
    'common.outOfQueue': 'Out of queue',
    'common.calling': 'Calling',
    'common.attending': 'Cutting',

    'display.col.available': 'Available',
    'display.col.busy': 'Busy',
    'display.col.break': 'Break',
    'display.shopClosed': 'Closed',

    'control.clearSanction': 'Clear sanction',
    'control.restoreBreak': 'Return break',
    'control.sanctionedUntil': 'Sanctioned until {time}',
    'control.restoreBreakHint': 'Took {n} break(s) today. Return one.',
    'control.errorNoBreaks': 'No breaks to return',
    'control.errorNetwork': 'Network error',
    'control.errorClearSanction': "Couldn't clear sanction",
    'control.errorRestoreBreak': "Couldn't return break",

    'stats.print': 'Download PDF',
    'stats.range.from': 'From',
    'stats.range.to': 'To',
    'stats.range.shortcuts': 'Range shortcuts',
    'stats.reload': 'Reload for fresh data.',
    'stats.lastUpdated': 'Last update',
    'stats.report': 'Report',
    'stats.generatedOn': 'Generated on {date}',

    'admin.nav.home': 'Home',
    'admin.nav.shops': 'Shops',
    'admin.nav.stats': 'Stats',
    'admin.nav.revenue': 'Revenue',
    'admin.nav.team': 'Team',
    'admin.nav.activity': 'Activity',
    'admin.nav.panelTokens': 'Panel Tokens',
    'admin.welcome': 'Welcome',
    'admin.exit': 'Sign out',
    'admin.title.admin': 'Admin',
    'admin.title.panel': 'Panel',
    'admin.openMenu': 'Open menu',
    'admin.closeMenu': 'Close menu',
    'admin.menuNav': 'Navigation menu',
  },
}
