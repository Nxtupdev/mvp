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
    'dash.nav.billing': 'Suscripción',
    // Variantes cortas para el MobileTabBar (5 tabs en mobile, espacio
    // apretado — usamos labels más compactos).
    'dash.nav.short.live': 'En vivo',
    'dash.nav.short.stats': 'Stats',
    'dash.nav.short.barbers': 'Barberos',
    'dash.nav.short.activity': 'Actividad',
    'dash.nav.short.settings': 'Ajustes',
    'dash.nav.signout': 'Cerrar sesión',
    'dash.nav.aria': 'Navegación del dashboard',

    // ── Servicios y precios (editor del dueño → voz Julie) ─────
    'services.title': 'Servicios y precios',
    'services.subtitle':
      'Julie cita estos precios por teléfono cuando un cliente pregunta. Actualízalos aquí y se sincronizan solos con ella.',
    'services.linkHint': 'Precios que Julie cita por teléfono',
    'services.namePlaceholder': 'Nombre del servicio',
    'services.pricePlaceholder': 'Precio',
    'services.empty': 'Aún no hay servicios. Agrega el primero arriba.',
    'services.deleteConfirm': '¿Eliminar este servicio?',
    'services.back': '← Configuración',

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
    // Rediseño 051 — columna mergeada (busy+break) y columna de cola.
    'display.col.occupied': 'Ocupados',
    'display.col.queue': 'En cola',
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
    'control.errorChangeState': 'No se pudo cambiar el estado',
    'control.errorFirstInLine': 'Ya está en el primer lugar de la fila',
    'control.errorLastInLine': 'Ya está en el último lugar de la fila',
    'control.errorMoveNotAvailable': 'Solo se puede mover si el barbero está disponible',
    'control.errorNotInLine': 'El barbero no está en la fila',
    'control.errorSanctionedMove': 'Tiene una sanción activa — levántala antes de moverlo',
    'control.errorMoveGeneric': 'No se pudo mover el barbero',
    'control.subtitle':
      'Cambia el estado de cualquier barbero remotamente. Útil si alguien se fue sin tocar BREAK, o si necesitas reorganizar la fila desde fuera del shop.',
    'control.subtitleToken':
      '{shop} · Cambia el estado de cualquier barbero. Si se fue sin tocar BREAK o necesitas reorganizar la fila, lo haces desde aquí.',
    'control.emptyBarbers': 'Sin barberos en este shop.',
    'control.moveUp': 'Subir en la cola',
    'control.moveDown': 'Bajar en la cola',
    'control.inLinePos': '#{n} en fila',
    'control.noPosition': 'sin posición',
    'control.busyWith': 'con {name}',
    'control.turnForfeited': 'turno perdido',

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

    // ── Dashboard live (pantalla principal del dueño) ──────────
    'dash.stat.waiting': 'Esperando',
    'dash.stat.called': 'Llamados',
    'dash.stat.inProgress': 'En silla',
    'dash.barbers.addFirst': '+ Agregar primer barbero',
    'dash.barber.positionAria': 'Posición {n}',
    'dash.barber.sanctionedUntil': 'Sancionado · hasta {time}',
    'dash.barber.keepPositionHint':
      'El barbero conserva esta posición si vuelve dentro del tiempo permitido',
    'dash.barber.returnsTo': 'Vuelve a #{n}',
    'dash.share.checkin.label': 'Check-in del cliente',
    'dash.share.checkin.hint': 'Imprimí este link como QR en la entrada',
    'dash.share.tv.label': 'Pantalla TV',
    'dash.share.tv.hint': 'Abrir en Fire TV / browser de la TV',
    'dash.break.expired': 'vencido',

    // ── Barbers manager (dashboard) ────────────────────────────
    'barbers.subtitle':
      'Cada barbero tiene su ícono — el equivalente digital del magnet con el que se identifica en la pizarra. Status se actualiza desde el NXT TAP o la app de respaldo.',
    'barbers.chooseIcon': 'Elegir ícono',
    'barbers.namePlaceholder': 'Nombre del barbero',
    'barbers.hideIcons': '▾ Ocultar íconos',
    'barbers.chooseIconOptional': '▸ Elegir ícono (opcional)',
    'barbers.emptyState': 'Sin barberos todavía. Agrega el primero arriba.',
    'barbers.supervision': 'Supervisión',
    'barbers.supervisionBlurb':
      '¿Necesitas cambiar el estado de un barbero desde fuera del shop? Útil si alguien se fue sin tocar BREAK o quieres reorganizar la fila a distancia.',
    'barbers.changeIcon': 'Cambiar ícono',
    'barbers.shareAria': 'Compartir link de {name}',
    'barbers.shareTitle': 'Mándale el link al barbero por QR o WhatsApp',
    'barbers.deleteAria': 'Eliminar {name}',
    'barbers.deleteConfirm': 'Eliminar barbero? Esta acción no se puede deshacer.',

    // ── Settings (Configuración del shop) ──────────────────────
    'settings.subtitle':
      'Configuración del shop. Los cambios afectan al display, check-in y barber app.',
    // Timezones
    'settings.tz.newYork': 'Eastern (NY, Miami) — DST',
    'settings.tz.santoDomingo': 'Santo Domingo (RD) — UTC-4 fijo',
    'settings.tz.chicago': 'Central (Chicago, CDMX*) — DST',
    'settings.tz.mexicoCity': 'Ciudad de México — DST',
    'settings.tz.denver': 'Mountain (Denver) — DST',
    'settings.tz.losAngeles': 'Pacific (LA) — DST',
    'settings.tz.bogota': 'Bogotá — UTC-5 fijo',
    'settings.tz.lima': 'Lima — UTC-5 fijo',
    'settings.tz.caracas': 'Caracas — UTC-4 fijo',
    // Fields + hints
    'settings.field.shopName': 'Nombre del shop',
    'settings.field.displayMessage': 'Mensaje en la pantalla (TV)',
    'settings.hint.displayMessage':
      'Aparece rotando en el cintillo de abajo de la TV del shop. Promos, avisos, horarios. Déjalo vacío para ocultar el cintillo.',
    'settings.placeholder.displayMessage':
      'Ej: ¡2x1 mañana por el 4 de julio! · Cerramos a las 6 hoy',
    'settings.field.displayLanguage': 'Idioma de la pantalla (TV)',
    'settings.hint.displayLanguage':
      'En qué idioma se ven los títulos de la TV del shop (Disponibles/Available, etc.).',
    'settings.field.maxQueue': 'Cupo máximo de la cola',
    'settings.hint.maxQueue': 'Cupos disponibles a la vez',
    'settings.section.breaks': 'Breaks',
    'settings.breaks.blurb':
      'El primer break del turno suele ser más largo (almuerzo). Los breaks siguientes son más cortos (baño, fumar). Se reinicia el contador cuando el barbero termina su turno.',
    'settings.field.firstBreak': 'Primer break (min)',
    'settings.hint.firstBreak': 'Almuerzo / break largo',
    'settings.field.nextBreak': 'Siguiente break (min)',
    'settings.hint.nextBreak': 'Cualquier break después del primero',
    'settings.section.queueRules': 'Reglas de la cola',
    'settings.queueRules.blurb':
      'Cada barbería opera diferente. Estas reglas determinan qué pasa con la posición FIFO de un barbero cuando toma break.',
    'settings.queueRules.legend': 'Política del turno durante break',
    'settings.breakMode.guaranteed.title': 'Turno garantizado',
    'settings.breakMode.guaranteed.body':
      'El barbero conserva su posición FIFO mientras esté en break y vuelva dentro del tiempo + gracia. Predictable: si vuelve a tiempo, recupera el turno pase lo que pase.',
    'settings.breakMode.notGuaranteed.title': 'Turno no garantizado',
    'settings.breakMode.notGuaranteed.body':
      'Igual al anterior, PERO si alguien que estaba debajo en la fila toma un walk-in y lo termina durante el break, el barbero pierde su turno aunque regrese a tiempo. Empuja a tomar break en momentos tranquilos.',
    'settings.field.grace': 'Minutos de gracia post-break',
    'settings.hint.grace':
      'Tiempo extra después del break antes de perder la posición. Aplica a ambos modos.',
    'settings.section.lateArrival': 'Llegada tarde',
    'settings.lateArrival.blurb':
      'Si un barbero llega después de la hora marcada y otros ya están trabajando, recibe una sanción por el tiempo que elijas. Durante la sanción no recibe walk-ins (pero sí clientes que lo piden por nombre) y queda al fondo de la cola con marca naranja. Se limpia sola al final del día.',
    'settings.lateArrival.enable': 'Activar regla de llegada tarde',
    'settings.field.lateThreshold': 'Hora límite',
    'settings.hint.lateThreshold':
      'Hora local en {timezone}. Después de esto, la primera vez que pase a DISPONIBLE se le aplica la sanción.',
    'settings.field.sanctionDuration': 'Duración de la sanción',
    'settings.hint.sanctionDuration':
      'Tiempo que el barbero queda sin recibir walk-ins.',
    'settings.custom': 'Personalizado',
    'settings.hoursUnit': 'horas',
    'settings.field.timezone': 'Zona horaria del shop',
    'settings.hint.timezone':
      "Define qué es 'hoy' para las stats, la bitácora y los resets diarios. Cambiala si el shop opera en otra ciudad.",
    'settings.saving': 'Guardando...',
    'settings.save': 'Guardar cambios',
    'settings.saved': 'Guardado',
    // Logo
    'settings.logo.errorFormat': 'Formato no soportado. Usa PNG, JPG, WebP o SVG.',
    'settings.logo.errorSize': 'El logo debe pesar menos de 2 MB.',
    'settings.logo.heading': 'Logo',
    'settings.logo.altPreview': 'Vista previa del logo',
    'settings.logo.altCurrent': 'Logo actual',
    'settings.logo.none': 'Sin logo',
    'settings.logo.readyToUpload': 'listo para subir',
    'settings.logo.current': 'Logo actual',
    'settings.logo.currentHint': 'Se muestra en el dashboard, display y check-in',
    'settings.logo.noneLabel': 'Sin logo',
    'settings.logo.formatHint': 'PNG, JPG, WebP o SVG · max 2 MB',
    'settings.logo.uploading': 'Subiendo...',
    'settings.logo.save': 'Guardar logo',
    'settings.logo.replace': 'Reemplazar',
    'settings.logo.upload': 'Subir',
    'settings.logo.removing': 'Eliminando...',
    'settings.logo.remove': 'Eliminar',
    'settings.logo.removeConfirm': 'Eliminar logo del shop?',
    // Account
    'settings.account.heading': 'Cuenta',
    'settings.account.email': 'Email',
    // Anti-cheat
    'settings.antiCheat.errorSave': 'Error al guardar',
    'settings.antiCheat.disableConfirm':
      'Desactivar la protección? Los barberos podrán entrar a la fila desde cualquier red.',
    'settings.antiCheat.errorClear': 'Error al desactivar',
    'settings.antiCheat.heading': 'Anti-trampa por ubicación',
    'settings.antiCheat.blurb':
      'Solo se permite entrar a la fila desde la conexión WiFi de la barbería. Registra la IP del shop una vez parado adentro y conectado al WiFi. Si tu internet cambia (raro pero pasa), vuelve a tocar "Registrar IP actual".',
    'settings.antiCheat.registeredIp': 'IP registrada del shop',
    'settings.antiCheat.notRegistered': 'No registrada',
    'settings.antiCheat.yourIp': 'Tu IP ahora mismo',
    'settings.antiCheat.connected': 'Estás conectado desde la red del shop',
    'settings.antiCheat.notConnected': 'No estás conectado desde la red del shop',
    'settings.antiCheat.saving': 'Guardando…',
    'settings.antiCheat.refreshIp': 'Refrescar IP del shop',
    'settings.antiCheat.registerIp': 'Registrar IP actual',
    'settings.antiCheat.disabling': 'Desactivando…',
    'settings.antiCheat.disable': 'Desactivar protección',

    // Stats page — content (labels, headings, deltas, breakdowns)
    'stats.preset.today.label': 'Hoy',
    'stats.preset.today.heading': 'Resumen del día. Comparado contra el día anterior.',
    'stats.preset.today.comparison': 'ayer',
    'stats.preset.7d.label': '7 días',
    'stats.preset.7d.heading': 'Últimos 7 días. Comparado contra los 7 días previos.',
    'stats.preset.7d.comparison': '7 días previos',
    'stats.preset.30d.label': '30 días',
    'stats.preset.30d.heading': 'Últimos 30 días. Comparado contra los 30 días previos.',
    'stats.preset.30d.comparison': '30 días previos',
    'stats.custom.heading':
      'Personalizado: {from} – {to}. Comparado contra el período previo del mismo tamaño.',
    'stats.custom.comparison': 'período previo',
    'stats.logoAlt': '{shop} logo',
    'stats.card.walkins': 'Walk-ins {range}',
    'stats.breakdown.attended.one': 'atendido',
    'stats.breakdown.attended.many': 'atendidos',
    'stats.breakdown.inProgress': 'en silla',
    'stats.breakdown.waiting': 'esperando',
    'stats.breakdown.cancelled.one': 'cancelado',
    'stats.breakdown.cancelled.many': 'cancelados',
    'stats.split.returning.one': 'recurrente',
    'stats.split.returning.many': 'recurrentes',
    'stats.split.new.one': 'nuevo',
    'stats.split.new.many': 'nuevos',
    'stats.voice.enRoute': '{count} en camino (voz)',
    'stats.card.avgWait': 'Tiempo promedio de espera',
    'stats.wait.noData': 'sin entries con called_at',
    'stats.delta.noData': 'Sin datos de {label}',
    'stats.delta.equal': 'Igual que {label}',
    'stats.delta.waitMin': '{delta} min vs {label} ({prev} min)',
    'stats.delta.count': '{sign}{delta}{unit} vs {label} (era {previous})',
    'stats.delta.countPct': '{sign}{pct}%{unit} vs {label} ({previous})',
    'stats.unit.returning': 'recurrentes',
    'stats.unit.new': 'nuevos',
    'stats.card.cutsByBarber': 'Cortes por barbero',
    'stats.empty.noCuts': 'Sin cortes registrados',
    'stats.card.peakHour': 'Hora pico',
    'stats.empty.noWalkins': 'Sin walk-ins registrados',
    'stats.peak.count.one': '{count} walk-in en ese rango',
    'stats.peak.count.many': '{count} walk-ins en ese rango',
    'stats.card.howHeard': '¿Cómo nos conocieron? · {count} nuevos',
    'stats.marketing.emptyNone': 'Sin clientes nuevos en el período',
    'stats.marketing.emptyNoSource': 'Clientes nuevos sin fuente registrada',

    // ── Activity feed (bitácora) ───────────────────────────────
    'activity.subtitle':
      'Registro de cada acción tomada por los barberos. Para resolver disputas y mantener constancia. Mostrando últimos 90 días.',
    'activity.filter.allBarbers': 'Todos los barberos',
    'activity.eventsCount': '{count} eventos',
    'activity.empty.noneInRange': 'Sin actividad registrada en este rango',
    'activity.empty.noMatch': 'No hay eventos que coincidan con los filtros',
    'activity.actor.system': 'Sistema',

    // Range filter options
    'activity.range.24h': 'Últimas 24h',
    'activity.range.today': 'Hoy (desde 0:00)',
    'activity.range.7d': '7 días',
    'activity.range.30d': '30 días',
    'activity.range.90d': '90 días',

    // Action filter options
    'activity.action.all': 'Todas',
    'activity.action.state_change': 'Cambios de estado',
    'activity.action.client_assigned': 'Cliente asignado',
    'activity.action.position_kept': 'Posición mantenida',
    'activity.action.position_lost': 'Posición perdida',
    'activity.action.no_show': 'No-show (cascada)',
    'activity.action.no_show_no_takers': 'No-show sin reemplazo',
    'activity.action.idle_timeout_offline': 'Auto-offline (timeout)',
    'activity.action.shop_settings_changed': 'Cambios de config',
    'activity.action.toll_cleared_by_owner': 'Peaje quitado (legacy)',
    'activity.action.fifo_moved_by_owner': 'Movido en fila por dueño',
    'activity.action.sanction_applied': 'Sanción aplicada',
    'activity.action.sanction_cleared': 'Sanción levantada',
    'activity.action.break_restored_by_owner': 'Break devuelto',

    // Event descriptions (describe())
    'activity.desc.stateChange': 'pasó de {from} a {to}',
    'activity.desc.clientAssigned': 'recibió a {name}',
    'activity.desc.clientAssignedGeneric': 'recibió un cliente',
    'activity.desc.positionKept': 'mantuvo su posición al volver del break',
    'activity.desc.positionLost': 'perdió su posición — excedió el break + gracia',
    'activity.desc.settingsChanged': 'cambió la configuración del shop',
    'activity.desc.noShow': 'no respondió a {name} → mandado a {target} (cascada 2 min)',
    'activity.desc.noShowGeneric': 'no respondió al cliente → mandado a {target} (cascada 2 min)',
    'activity.desc.noTakers': '{name} volvió a la cola — nadie disponible para tomar',
    'activity.desc.noTakersGeneric': 'cliente volvió a la cola — nadie disponible',
    'activity.desc.autoOffline.breakExpired': 'se pasó del break + gracia → offline automático',
    'activity.desc.autoOffline.busyTooLong': 'congelado en busy más de 3h → offline automático',
    'activity.desc.autoOffline.idle': 'sin actividad por 3h → offline automático',
    'activity.desc.tollCleared': 'penalidad quitada por el dueño',
    'activity.desc.tollClearedLegacy': 'obligaciones de peaje limpiadas por el dueño',
    'activity.desc.fifoUp': 'movido un slot arriba en la fila por el dueño',
    'activity.desc.fifoDown': 'movido un slot abajo en la fila por el dueño',
    'activity.desc.sanctioned': 'sancionado {hours}h por llegada tarde — hasta {time}',
    'activity.desc.sanctionedNoTime': 'sancionado {hours}h por llegada tarde',
    'activity.desc.sanctionedGeneric': 'sancionado por llegada tarde',
    'activity.desc.sanctionCleared': 'sanción levantada por el dueño',
    'activity.desc.sanctionClearedNightly': 'sanción limpiada en el reset nocturno',
    'activity.desc.breakUndone': 'el dueño le deshizo el break en curso{counter}',
    'activity.desc.breakReturned': 'el dueño le devolvió un break{counter}',

    // Metadata detail strings (formatMetadata())
    'activity.meta.ordinal.first': 'primer',
    'activity.meta.ordinal.second': 'segundo',
    'activity.meta.ordinal.nth': '#{n}',
    'activity.meta.breakDuration': '{ordinal} break — {min} min',
    'activity.meta.queuePos': 'Cola #{n}',
    'activity.meta.breakElapsed': '{elapsed} min en break · permitido {allowed} min',
    'activity.meta.settingChange': '{key}: {from} → {to}',
    'activity.meta.minutesOver': '{over} min sobre el permitido ({total} min)',
    'activity.meta.idleMin': '{min} min sin actividad',
    'activity.meta.idleHours': '{hours} h sin actividad',
    'activity.meta.secondsNoTap': '{seconds} s sin tap a busy',
    'activity.meta.on': 'on',
    'activity.meta.off': 'off',
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
    'dash.nav.billing': 'Billing',
    'dash.nav.short.live': 'Live',
    'dash.nav.short.stats': 'Stats',
    'dash.nav.short.barbers': 'Barbers',
    'dash.nav.short.activity': 'Activity',
    'dash.nav.short.settings': 'Settings',
    'dash.nav.signout': 'Sign out',
    'dash.nav.aria': 'Dashboard navigation',

    // ── Services & prices ──────────────────────────────────────
    'services.title': 'Services & prices',
    'services.subtitle':
      'Julie quotes these prices on the phone when a client asks. Update them here and they sync to her automatically.',
    'services.linkHint': 'Prices Julie quotes on the phone',
    'services.namePlaceholder': 'Service name',
    'services.pricePlaceholder': 'Price',
    'services.empty': 'No services yet. Add the first one above.',
    'services.deleteConfirm': 'Delete this service?',
    'services.back': '← Settings',

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
    'display.col.occupied': 'Busy',
    'display.col.queue': 'In queue',
    'display.shopClosed': 'Closed',

    'control.clearSanction': 'Clear sanction',
    'control.restoreBreak': 'Return break',
    'control.sanctionedUntil': 'Sanctioned until {time}',
    'control.restoreBreakHint': 'Took {n} break(s) today. Return one.',
    'control.errorNoBreaks': 'No breaks to return',
    'control.errorNetwork': 'Network error',
    'control.errorClearSanction': "Couldn't clear sanction",
    'control.errorRestoreBreak': "Couldn't return break",
    'control.errorChangeState': "Couldn't change the status",
    'control.errorFirstInLine': 'Already first in line',
    'control.errorLastInLine': 'Already last in line',
    'control.errorMoveNotAvailable': 'Can only move a barber who is available',
    'control.errorNotInLine': 'The barber is not in the line',
    'control.errorSanctionedMove':
      'They have an active sanction — clear it before moving them',
    'control.errorMoveGeneric': "Couldn't move the barber",
    'control.subtitle':
      "Change any barber's status remotely. Useful if someone left without tapping BREAK, or you need to reorganize the line from outside the shop.",
    'control.subtitleToken':
      "{shop} · Change any barber's status. If someone left without tapping BREAK or you need to reorganize the line, do it here.",
    'control.emptyBarbers': 'No barbers in this shop.',
    'control.moveUp': 'Move up in the line',
    'control.moveDown': 'Move down in the line',
    'control.inLinePos': '#{n} in line',
    'control.noPosition': 'no position',
    'control.busyWith': 'with {name}',
    'control.turnForfeited': 'turn lost',

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

    // ── Dashboard live ─────────────────────────────────────────
    'dash.stat.waiting': 'Waiting',
    'dash.stat.called': 'Called',
    'dash.stat.inProgress': 'In chair',
    'dash.barbers.addFirst': '+ Add first barber',
    'dash.barber.positionAria': 'Position {n}',
    'dash.barber.sanctionedUntil': 'Sanctioned · until {time}',
    'dash.barber.keepPositionHint':
      'The barber keeps this spot if they return within the allowed time',
    'dash.barber.returnsTo': 'Returns to #{n}',
    'dash.share.checkin.label': 'Client check-in',
    'dash.share.checkin.hint': 'Print this link as a QR at the entrance',
    'dash.share.tv.label': 'TV display',
    'dash.share.tv.hint': 'Open on Fire TV / the TV browser',
    'dash.break.expired': 'expired',

    // ── Barbers manager ────────────────────────────────────────
    'barbers.subtitle':
      'Every barber has their icon — the digital equivalent of the magnet they use on the board. Status updates from the NXT TAP or the backup app.',
    'barbers.chooseIcon': 'Choose icon',
    'barbers.namePlaceholder': 'Barber name',
    'barbers.hideIcons': '▾ Hide icons',
    'barbers.chooseIconOptional': '▸ Choose icon (optional)',
    'barbers.emptyState': 'No barbers yet. Add the first one above.',
    'barbers.supervision': 'Supervision',
    'barbers.supervisionBlurb':
      "Need to change a barber's status from outside the shop? Useful if someone left without tapping BREAK or you want to reorganize the line remotely.",
    'barbers.changeIcon': 'Change icon',
    'barbers.shareAria': "Share {name}'s link",
    'barbers.shareTitle': 'Send the barber their link by QR or WhatsApp',
    'barbers.deleteAria': 'Delete {name}',
    'barbers.deleteConfirm': 'Delete barber? This action cannot be undone.',

    // ── Settings (Shop configuration) ──────────────────────────
    'settings.subtitle':
      'Shop settings. Changes affect the display, check-in and barber app.',
    // Timezones
    'settings.tz.newYork': 'Eastern (NY, Miami) — DST',
    'settings.tz.santoDomingo': 'Santo Domingo (DR) — fixed UTC-4',
    'settings.tz.chicago': 'Central (Chicago, CDMX*) — DST',
    'settings.tz.mexicoCity': 'Mexico City — DST',
    'settings.tz.denver': 'Mountain (Denver) — DST',
    'settings.tz.losAngeles': 'Pacific (LA) — DST',
    'settings.tz.bogota': 'Bogotá — fixed UTC-5',
    'settings.tz.lima': 'Lima — fixed UTC-5',
    'settings.tz.caracas': 'Caracas — fixed UTC-4',
    // Fields + hints
    'settings.field.shopName': 'Shop name',
    'settings.field.displayMessage': 'On-screen message (TV)',
    'settings.hint.displayMessage':
      'Rotates in the ticker at the bottom of the shop TV. Promos, notices, hours. Leave it empty to hide the ticker.',
    'settings.placeholder.displayMessage':
      'E.g.: 2-for-1 tomorrow for the 4th of July! · We close at 6 today',
    'settings.field.displayLanguage': 'Screen language (TV)',
    'settings.hint.displayLanguage':
      'What language the shop TV titles show in (Disponibles/Available, etc.).',
    'settings.field.maxQueue': 'Max queue size',
    'settings.hint.maxQueue': 'Spots available at a time',
    'settings.section.breaks': 'Breaks',
    'settings.breaks.blurb':
      'The first break of the shift is usually longer (lunch). Later breaks are shorter (restroom, smoke). The counter resets when the barber ends their shift.',
    'settings.field.firstBreak': 'First break (min)',
    'settings.hint.firstBreak': 'Lunch / long break',
    'settings.field.nextBreak': 'Next break (min)',
    'settings.hint.nextBreak': 'Any break after the first',
    'settings.section.queueRules': 'Queue rules',
    'settings.queueRules.blurb':
      "Every shop runs differently. These rules determine what happens to a barber's FIFO position when they take a break.",
    'settings.queueRules.legend': 'Turn policy during break',
    'settings.breakMode.guaranteed.title': 'Guaranteed turn',
    'settings.breakMode.guaranteed.body':
      'The barber keeps their FIFO position while on break as long as they return within the time + grace. Predictable: if they come back on time, they get their turn back no matter what.',
    'settings.breakMode.notGuaranteed.title': 'Non-guaranteed turn',
    'settings.breakMode.notGuaranteed.body':
      'Same as above, BUT if someone lower in the line takes a walk-in and finishes it during the break, the barber loses their turn even if they return on time. Encourages taking breaks during quiet moments.',
    'settings.field.grace': 'Post-break grace minutes',
    'settings.hint.grace':
      'Extra time after the break before losing the position. Applies to both modes.',
    'settings.section.lateArrival': 'Late arrival',
    'settings.lateArrival.blurb':
      'If a barber arrives after the marked time and others are already working, they get a sanction for the time you choose. During the sanction they receive no walk-ins (but do get clients who ask for them by name) and go to the back of the line with an orange mark. It clears itself at the end of the day.',
    'settings.lateArrival.enable': 'Enable late-arrival rule',
    'settings.field.lateThreshold': 'Cutoff time',
    'settings.hint.lateThreshold':
      'Local time in {timezone}. After this, the first time they go AVAILABLE the sanction is applied.',
    'settings.field.sanctionDuration': 'Sanction duration',
    'settings.hint.sanctionDuration':
      'How long the barber goes without receiving walk-ins.',
    'settings.custom': 'Custom',
    'settings.hoursUnit': 'hours',
    'settings.field.timezone': 'Shop timezone',
    'settings.hint.timezone':
      "Defines what 'today' means for stats, the log and daily resets. Change it if the shop operates in another city.",
    'settings.saving': 'Saving...',
    'settings.save': 'Save changes',
    'settings.saved': 'Saved',
    // Logo
    'settings.logo.errorFormat': 'Unsupported format. Use PNG, JPG, WebP or SVG.',
    'settings.logo.errorSize': 'The logo must be under 2 MB.',
    'settings.logo.heading': 'Logo',
    'settings.logo.altPreview': 'Logo preview',
    'settings.logo.altCurrent': 'Current logo',
    'settings.logo.none': 'No logo',
    'settings.logo.readyToUpload': 'ready to upload',
    'settings.logo.current': 'Current logo',
    'settings.logo.currentHint': 'Shown on the dashboard, display and check-in',
    'settings.logo.noneLabel': 'No logo',
    'settings.logo.formatHint': 'PNG, JPG, WebP or SVG · max 2 MB',
    'settings.logo.uploading': 'Uploading...',
    'settings.logo.save': 'Save logo',
    'settings.logo.replace': 'Replace',
    'settings.logo.upload': 'Upload',
    'settings.logo.removing': 'Removing...',
    'settings.logo.remove': 'Remove',
    'settings.logo.removeConfirm': 'Remove shop logo?',
    // Account
    'settings.account.heading': 'Account',
    'settings.account.email': 'Email',
    // Anti-cheat
    'settings.antiCheat.errorSave': 'Error saving',
    'settings.antiCheat.disableConfirm':
      'Disable the protection? Barbers will be able to join the line from any network.',
    'settings.antiCheat.errorClear': 'Error disabling',
    'settings.antiCheat.heading': 'Location anti-cheat',
    'settings.antiCheat.blurb':
      'Joining the line is only allowed from the shop WiFi connection. Register the shop IP once while standing inside and connected to the WiFi. If your internet changes (rare, but it happens), tap "Register current IP" again.',
    'settings.antiCheat.registeredIp': 'Registered shop IP',
    'settings.antiCheat.notRegistered': 'Not registered',
    'settings.antiCheat.yourIp': 'Your IP right now',
    'settings.antiCheat.connected': "You're connected from the shop network",
    'settings.antiCheat.notConnected': "You're not connected from the shop network",
    'settings.antiCheat.saving': 'Saving…',
    'settings.antiCheat.refreshIp': 'Refresh shop IP',
    'settings.antiCheat.registerIp': 'Register current IP',
    'settings.antiCheat.disabling': 'Disabling…',
    'settings.antiCheat.disable': 'Disable protection',

    // Stats page — content (labels, headings, deltas, breakdowns)
    'stats.preset.today.label': 'Today',
    'stats.preset.today.heading': "Today's summary. Compared against the day before.",
    'stats.preset.today.comparison': 'yesterday',
    'stats.preset.7d.label': '7 days',
    'stats.preset.7d.heading': 'Last 7 days. Compared against the previous 7 days.',
    'stats.preset.7d.comparison': 'previous 7 days',
    'stats.preset.30d.label': '30 days',
    'stats.preset.30d.heading': 'Last 30 days. Compared against the previous 30 days.',
    'stats.preset.30d.comparison': 'previous 30 days',
    'stats.custom.heading':
      'Custom: {from} – {to}. Compared against the previous period of the same size.',
    'stats.custom.comparison': 'previous period',
    'stats.logoAlt': '{shop} logo',
    'stats.card.walkins': 'Walk-ins {range}',
    'stats.breakdown.attended.one': 'served',
    'stats.breakdown.attended.many': 'served',
    'stats.breakdown.inProgress': 'in chair',
    'stats.breakdown.waiting': 'waiting',
    'stats.breakdown.cancelled.one': 'cancelled',
    'stats.breakdown.cancelled.many': 'cancelled',
    'stats.split.returning.one': 'returning',
    'stats.split.returning.many': 'returning',
    'stats.split.new.one': 'new',
    'stats.split.new.many': 'new',
    'stats.voice.enRoute': '{count} on the way (voice)',
    'stats.card.avgWait': 'Average wait time',
    'stats.wait.noData': 'no entries with called_at',
    'stats.delta.noData': 'No data from {label}',
    'stats.delta.equal': 'Same as {label}',
    'stats.delta.waitMin': '{delta} min vs {label} ({prev} min)',
    'stats.delta.count': '{sign}{delta}{unit} vs {label} (was {previous})',
    'stats.delta.countPct': '{sign}{pct}%{unit} vs {label} ({previous})',
    'stats.unit.returning': 'returning',
    'stats.unit.new': 'new',
    'stats.card.cutsByBarber': 'Cuts by barber',
    'stats.empty.noCuts': 'No cuts recorded',
    'stats.card.peakHour': 'Peak hour',
    'stats.empty.noWalkins': 'No walk-ins recorded',
    'stats.peak.count.one': '{count} walk-in in that range',
    'stats.peak.count.many': '{count} walk-ins in that range',
    'stats.card.howHeard': 'How did they hear about us? · {count} new',
    'stats.marketing.emptyNone': 'No new clients in the period',
    'stats.marketing.emptyNoSource': 'New clients with no source recorded',

    // ── Activity feed (audit log) ──────────────────────────────
    'activity.subtitle':
      'A record of every action taken by the barbers. For settling disputes and keeping a paper trail. Showing the last 90 days.',
    'activity.filter.allBarbers': 'All barbers',
    'activity.eventsCount': '{count} events',
    'activity.empty.noneInRange': 'No activity recorded in this range',
    'activity.empty.noMatch': 'No events match the filters',
    'activity.actor.system': 'System',

    // Range filter options
    'activity.range.24h': 'Last 24h',
    'activity.range.today': 'Today (since 0:00)',
    'activity.range.7d': '7 days',
    'activity.range.30d': '30 days',
    'activity.range.90d': '90 days',

    // Action filter options
    'activity.action.all': 'All',
    'activity.action.state_change': 'Status changes',
    'activity.action.client_assigned': 'Client assigned',
    'activity.action.position_kept': 'Position kept',
    'activity.action.position_lost': 'Position lost',
    'activity.action.no_show': 'No-show (cascade)',
    'activity.action.no_show_no_takers': 'No-show, no replacement',
    'activity.action.idle_timeout_offline': 'Auto-offline (timeout)',
    'activity.action.shop_settings_changed': 'Settings changes',
    'activity.action.toll_cleared_by_owner': 'Toll cleared (legacy)',
    'activity.action.fifo_moved_by_owner': 'Moved in line by owner',
    'activity.action.sanction_applied': 'Sanction applied',
    'activity.action.sanction_cleared': 'Sanction cleared',
    'activity.action.break_restored_by_owner': 'Break returned',

    // Event descriptions (describe())
    'activity.desc.stateChange': 'went from {from} to {to}',
    'activity.desc.clientAssigned': 'took {name}',
    'activity.desc.clientAssignedGeneric': 'took a client',
    'activity.desc.positionKept': 'kept their position on returning from break',
    'activity.desc.positionLost': 'lost their position — exceeded break + grace',
    'activity.desc.settingsChanged': 'changed the shop settings',
    'activity.desc.noShow': "didn't respond to {name} → sent to {target} (2 min cascade)",
    'activity.desc.noShowGeneric': "didn't respond to the client → sent to {target} (2 min cascade)",
    'activity.desc.noTakers': '{name} went back to the queue — nobody available to take',
    'activity.desc.noTakersGeneric': 'client went back to the queue — nobody available',
    'activity.desc.autoOffline.breakExpired': 'went past break + grace → auto offline',
    'activity.desc.autoOffline.busyTooLong': 'stuck on busy for over 3h → auto offline',
    'activity.desc.autoOffline.idle': 'no activity for 3h → auto offline',
    'activity.desc.tollCleared': 'penalty cleared by the owner',
    'activity.desc.tollClearedLegacy': 'toll obligations cleared by the owner',
    'activity.desc.fifoUp': 'moved up one slot in the line by the owner',
    'activity.desc.fifoDown': 'moved down one slot in the line by the owner',
    'activity.desc.sanctioned': 'sanctioned {hours}h for late arrival — until {time}',
    'activity.desc.sanctionedNoTime': 'sanctioned {hours}h for late arrival',
    'activity.desc.sanctionedGeneric': 'sanctioned for late arrival',
    'activity.desc.sanctionCleared': 'sanction cleared by the owner',
    'activity.desc.sanctionClearedNightly': 'sanction cleared in the nightly reset',
    'activity.desc.breakUndone': 'the owner undid their in-progress break{counter}',
    'activity.desc.breakReturned': 'the owner returned a break to them{counter}',

    // Metadata detail strings (formatMetadata())
    'activity.meta.ordinal.first': 'first',
    'activity.meta.ordinal.second': 'second',
    'activity.meta.ordinal.nth': '#{n}',
    'activity.meta.breakDuration': '{ordinal} break — {min} min',
    'activity.meta.queuePos': 'Queue #{n}',
    'activity.meta.breakElapsed': '{elapsed} min on break · allowed {allowed} min',
    'activity.meta.settingChange': '{key}: {from} → {to}',
    'activity.meta.minutesOver': '{over} min over the allowed ({total} min)',
    'activity.meta.idleMin': '{min} min with no activity',
    'activity.meta.idleHours': '{hours} h with no activity',
    'activity.meta.secondsNoTap': '{seconds} s without tapping busy',
    'activity.meta.on': 'on',
    'activity.meta.off': 'off',
  },
}
