// GUI mínima de PokeObs.
//
// Responsabilidades:
//   1. Editar userConfig.json (puertos y IP de Citra), que es la configuración
//      persistente que lee el backend al arrancar.
//   2. Elegir el juego, que NO se persiste: se pasa como argumento al proceso.
//   3. Lanzar el backend (dist/src/main.js), que arranca el overlayServer y,
//      una vez está escuchando, el httpServer.

const RUTA_BACKEND = 'dist/src/main.js';

// La GUI vive dentro del repo, así que la raíz del proyecto es su carpeta
// padre. Se resuelve al arrancar porque en modo desarrollo NL_PATH es relativo.
const rutas = {
    proyecto: '',
    config: '',
};

// getAbsolutePath deja los "." y ".." tal cual y spawnProcess no acepta un cwd
// sin resolver, así que lo colapsamos a mano.
function normalizar(ruta) {
    const partes = [];

    ruta.split('/').forEach((parte) => {
        if (parte === '' || parte === '.') {
            return;
        }

        if (parte === '..') {
            partes.pop();
        } else {
            partes.push(parte);
        }
    });

    return `/${partes.join('/')}`;
}

async function resolverRutas() {
    const rutaGui = await Neutralino.filesystem.getAbsolutePath(NL_PATH);

    rutas.proyecto = normalizar(`${rutaGui}/..`);
    rutas.config = `${rutas.proyecto}/src/config/userConfig/userConfig.json`;
}

// Si no se puede consultar al backend (todavía no compilado), al menos el
// desplegable no se queda vacío.
const JUEGOS_POR_DEFECTO = ['PokemonXY-1.0', 'PokemonXY-1.1'];

const elementos = {
    juego: document.getElementById('juego'),
    puertoWebsocket: document.getElementById('puertoWebsocket'),
    puertoHttp: document.getElementById('puertoHttp'),
    ipEmulador: document.getElementById('ipEmulador'),
    puertoEmulador: document.getElementById('puertoEmulador'),
    vidasIniciales: document.getElementById('vidasIniciales'),
    vidasActuales: document.getElementById('vidasActuales'),
    fuenteNombre: document.getElementById('fuenteNombre'),
    colorNombre: document.getElementById('colorNombre'),
    negritaNombre: document.getElementById('negritaNombre'),
    cursivaNombre: document.getElementById('cursivaNombre'),
    fuenteVidas: document.getElementById('fuenteVidas'),
    colorVidas: document.getElementById('colorVidas'),
    negritaVidas: document.getElementById('negritaVidas'),
    cursivaVidas: document.getElementById('cursivaVidas'),
    rutaRecursos: document.getElementById('rutaRecursos'),
    rutaRecursosTexto: document.getElementById('rutaRecursosTexto'),
    botonRuta: document.getElementById('botonRuta'),
    btnSprites: document.getElementById('btnSprites'),
    panelEndpoints: document.getElementById('panelEndpoints'),
    listaEndpoints: document.getElementById('listaEndpoints'),
    botonColorNombre: document.getElementById('botonColorNombre'),
    botonColorVidas: document.getElementById('botonColorVidas'),
    selectorColor: document.getElementById('selectorColor'),
    paleta: document.getElementById('paleta'),
    colorHex: document.getElementById('colorHex'),
    colorPrevia: document.getElementById('colorPrevia'),
    colorAceptar: document.getElementById('colorAceptar'),
    colorCancelar: document.getElementById('colorCancelar'),
    estado: document.getElementById('estado'),
    registro: document.getElementById('registro'),
    btnArrancar: document.getElementById('btnArrancar'),
    btnParar: document.getElementById('btnParar'),
    btnLimpiar: document.getElementById('btnLimpiar'),
    enlaceFuentes: document.getElementById('enlaceFuentes'),
    ayudaFuentes: document.getElementById('ayudaFuentes'),
    ayudaFuentesCerrar: document.getElementById('ayudaFuentesCerrar'),
};

let configuracion = null;
let procesoBackend = null;
let detencionSolicitada = false;

// --- Gestión de procesos hijo -----------------------------------------------

// Neutralino emite todos los eventos de procesos por el mismo canal, así que
// los repartimos por id. Los que llegan antes de registrar su manejador (la
// promesa de spawnProcess puede resolverse después del primer stdOut) se
// guardan para entregarlos en cuanto haya alguien escuchando.
const manejadores = new Map();
const pendientes = new Map();

Neutralino.events.on('spawnedProcess', (evt) => {
    const manejador = manejadores.get(evt.detail.id);

    if (manejador) {
        manejador(evt.detail);
    } else {
        const cola = pendientes.get(evt.detail.id) ?? [];
        cola.push(evt.detail);
        pendientes.set(evt.detail.id, cola);
    }
});

function escucharProceso(id, manejador) {
    manejadores.set(id, manejador);
    (pendientes.get(id) ?? []).forEach(manejador);
    pendientes.delete(id);
}

function dejarDeEscuchar(id) {
    manejadores.delete(id);
    pendientes.delete(id);
}

// Lanza un comando y espera a que termine, devolviendo su salida.
async function ejecutar(comando, { alRecibir } = {}) {
    const proceso = await Neutralino.os.spawnProcess(comando, { cwd: rutas.proyecto });

    return new Promise((resolver) => {
        let salida = '';
        let error = '';

        escucharProceso(proceso.id, (detalle) => {
            switch (detalle.action) {
                case 'stdOut':
                    salida += detalle.data;
                    alRecibir?.(detalle.data, false);
                    break;
                case 'stdErr':
                    error += detalle.data;
                    alRecibir?.(detalle.data, true);
                    break;
                case 'exit':
                    dejarDeEscuchar(proceso.id);
                    resolver({ salida, error, codigo: parseInt(detalle.data) });
                    break;
            }
        });
    });
}

// --- Registro y estado ------------------------------------------------------

function registrar(texto, esError = false) {
    const linea = document.createElement('span');
    linea.textContent = `${texto.replace(/\s+$/, '')}\n`;

    if (esError) {
        linea.className = 'error';
    }

    elementos.registro.appendChild(linea);
    elementos.registro.scrollTop = elementos.registro.scrollHeight;
}

function fijarEstado(estado, texto) {
    elementos.estado.className = `estado estado--${estado}`;
    elementos.estado.textContent = texto;
}

// Mientras el backend corre, la configuración ya está en uso: bloqueamos los
// campos para que lo que se ve en pantalla sea siempre lo que se está usando.
function bloquearFormulario(bloqueado) {
    [elementos.juego, elementos.puertoWebsocket, elementos.puertoHttp,
     elementos.ipEmulador, elementos.puertoEmulador,
     elementos.vidasIniciales, elementos.vidasActuales,
     elementos.fuenteNombre, elementos.colorNombre, elementos.negritaNombre, elementos.cursivaNombre,
     elementos.fuenteVidas, elementos.colorVidas, elementos.negritaVidas, elementos.cursivaVidas,
     elementos.botonColorNombre, elementos.botonColorVidas,
     elementos.botonRuta, elementos.btnSprites].forEach((campo) => {
        campo.disabled = bloqueado;
    });

    elementos.btnArrancar.disabled = bloqueado;
    elementos.btnParar.disabled = !bloqueado;
}

// --- Fuentes para OBS -------------------------------------------------------

// Mientras el servidor corre la configuración está bloqueada, así que ese hueco
// se aprovecha para enseñar las URLs que hay que pegar en OBS.
function listaDeEndpoints(puerto, totalVidas) {
    const base = `http://localhost:${puerto}`;

    return [
        {
            url: `${base}/medallas/1`,
            rango: 'del 1 al 8',
            descripcion: 'Una medalla. Sale en color cuando la consigues y en gris mientras no la tengas.',
        },
        {
            url: `${base}/pokemon/1/imagen`,
            rango: 'huecos del 1 al 6',
            descripcion: 'El sprite del Pokémon que ocupe ese hueco del equipo. Desaparece si el hueco está vacío o si está debilitado.',
        },
        {
            url: `${base}/pokemon/1/nombre`,
            rango: 'huecos del 1 al 6',
            descripcion: 'El mote de ese Pokémon, con la tipografía que hayas elegido. Desaparece en los mismos casos que el sprite.',
        },
        {
            url: `${base}/vidas`,
            descripcion: 'Las vidas que te quedan, en número.',
        },
        {
            url: `${base}/vidas/1`,
            rango: `del 1 al ${totalVidas}`,
            descripcion: 'Un icono por vida. En color mientras la conserves y en gris en cuanto la pierdas.',
        },
    ];
}

function pintarEndpoints(puerto, totalVidas) {
    elementos.listaEndpoints.innerHTML = '';

    listaDeEndpoints(puerto, totalVidas).forEach((entrada) => {
        const fila = document.createElement('li');

        const url = document.createElement('span');
        url.className = 'url';
        url.textContent = entrada.url;
        fila.appendChild(url);

        if (entrada.rango) {
            const rango = document.createElement('span');
            rango.className = 'rango';
            rango.textContent = entrada.rango;
            fila.appendChild(rango);
        }

        const descripcion = document.createElement('p');
        descripcion.className = 'descripcion';
        descripcion.textContent = entrada.descripcion;
        fila.appendChild(descripcion);

        elementos.listaEndpoints.appendChild(fila);
    });
}

// Con el servidor en marcha se enseñan las fuentes; parado, la configuración.
function mostrarEndpoints(mostrar) {
    document.querySelectorAll('.seccion-config').forEach((seccion) => {
        seccion.classList.toggle('oculto', mostrar);
    });

    elementos.panelEndpoints.classList.toggle('oculto', !mostrar);
}

// --- Configuración ----------------------------------------------------------

async function cargarConfiguracion() {
    try {
        configuracion = JSON.parse(await Neutralino.filesystem.readFile(rutas.config));
    } catch (error) {
        registrar(`No se pudo leer userConfig.json: ${error.message ?? error}`, true);
        fijarEstado('error', 'Sin configuración');
        return false;
    }

    elementos.puertoWebsocket.value = configuracion.websocket.port;
    elementos.puertoHttp.value = configuracion.httpServer.port;
    elementos.ipEmulador.value = configuracion.emulador.ip;
    elementos.puertoEmulador.value = configuracion.emulador.puerto;
    elementos.rutaRecursos.value = configuracion.rutaRecursos ?? '';
    pintarRuta();
    elementos.vidasIniciales.value = configuracion.vidas.iniciales;
    elementos.vidasActuales.value = configuracion.vidas.actuales;

    volcarEstilo(configuracion.estilos.nombrePokemon, 'Nombre');
    volcarEstilo(configuracion.estilos.vidas, 'Vidas');
    return true;
}

// Los dos bloques de tipografía tienen los mismos cuatro controles, así que se
// leen y se escriben por sufijo en vez de repetir el bloque entero.
function volcarEstilo(estilo, sufijo) {
    elementos[`fuente${sufijo}`].value = estilo.fuente;
    elementos[`color${sufijo}`].value = estilo.color;
    elementos[`negrita${sufijo}`].checked = estilo.negrita;
    elementos[`cursiva${sufijo}`].checked = estilo.cursiva;
    pintarMuestra(sufijo);
}

function pintarRuta() {
    elementos.rutaRecursosTexto.textContent = elementos.rutaRecursos.value || 'Sin elegir';
}

// Refleja en el botón el color que guarda su campo oculto.
function pintarMuestra(sufijo) {
    const color = elementos[`color${sufijo}`].value;
    const boton = elementos[`botonColor${sufijo}`];

    boton.querySelector('.muestra-cuadro').style.background = color;
    boton.querySelector('.muestra-hex').textContent = color;
}

function leerEstilo(sufijo) {
    return {
        // Sin fuente, la plantilla se queda con la del sistema.
        fuente: elementos[`fuente${sufijo}`].value.trim() || 'sans-serif',
        negrita: elementos[`negrita${sufijo}`].checked,
        cursiva: elementos[`cursiva${sufijo}`].checked,
        color: elementos[`color${sufijo}`].value,
    };
}

function leerEntero(elemento, minimo, maximo) {
    const valor = Number(elemento.value);
    const valido = elemento.value !== '' && Number.isInteger(valor) && valor >= minimo && valor <= maximo;

    elemento.classList.toggle('invalido', !valido);
    return valido ? valor : null;
}

function leerPuerto(elemento) {
    return leerEntero(elemento, 1, 65535);
}

// Devuelve los ajustes del formulario, o null si hay algo inválido.
function validarFormulario() {
    const puertoWebsocket = leerPuerto(elementos.puertoWebsocket);
    const puertoHttp = leerPuerto(elementos.puertoHttp);
    const puertoEmulador = leerPuerto(elementos.puertoEmulador);
    const ipEmulador = elementos.ipEmulador.value.trim();
    const vidasIniciales = leerEntero(elementos.vidasIniciales, 1, 99);
    const vidasActuales = leerEntero(elementos.vidasActuales, 0, 99);

    elementos.ipEmulador.classList.toggle('invalido', ipEmulador === '');

    if (!puertoWebsocket || !puertoHttp || !puertoEmulador || ipEmulador === ''
        || vidasIniciales === null || vidasActuales === null) {
        registrar('Revisa los campos marcados: los puertos van de 1 a 65535, la IP no puede estar vacía y las vidas van de 0 a 99.', true);
        return null;
    }

    // Cada vida es un recurso /vidas/N, así que no puede haber más restantes
    // que totales: sobrarían iconos que nadie puede mostrar.
    if (vidasActuales > vidasIniciales) {
        elementos.vidasActuales.classList.add('invalido');
        registrar('Las vidas restantes no pueden superar a las totales.', true);
        return null;
    }

    if (puertoWebsocket === puertoHttp) {
        elementos.puertoWebsocket.classList.add('invalido');
        elementos.puertoHttp.classList.add('invalido');
        registrar('El WebSocket y el servidor HTTP no pueden usar el mismo puerto.', true);
        return null;
    }

    return {
        puertoWebsocket, puertoHttp, ipEmulador, puertoEmulador, vidasIniciales, vidasActuales,
        rutaRecursos: elementos.rutaRecursos.value,
        estiloNombre: leerEstilo('Nombre'),
        estiloVidas: leerEstilo('Vidas'),
    };
}

// Reescribe solo los campos que gestiona la GUI para no perder el resto.
async function guardarConfiguracion(ajustes) {
    configuracion.websocket.port = ajustes.puertoWebsocket;
    configuracion.httpServer.port = ajustes.puertoHttp;
    configuracion.emulador.ip = ajustes.ipEmulador;
    configuracion.emulador.puerto = ajustes.puertoEmulador;
    configuracion.rutaRecursos = ajustes.rutaRecursos;
    configuracion.vidas.iniciales = ajustes.vidasIniciales;
    configuracion.vidas.actuales = ajustes.vidasActuales;
    configuracion.estilos.nombrePokemon = ajustes.estiloNombre;
    configuracion.estilos.vidas = ajustes.estiloVidas;

    await Neutralino.filesystem.writeFile(rutas.config, JSON.stringify(configuracion, null, 2) + '\n');
}

// --- Juegos disponibles -----------------------------------------------------

function pintarJuegos(juegos) {
    const seleccionado = elementos.juego.value;
    elementos.juego.innerHTML = '';

    juegos.forEach((juego) => {
        const opcion = document.createElement('option');
        opcion.value = juego;
        opcion.textContent = juego;
        elementos.juego.appendChild(opcion);
    });

    if (juegos.includes(seleccionado)) {
        elementos.juego.value = seleccionado;
    }
}

// El registro de juegos soportados vive en el backend; se lo preguntamos en vez
// de duplicar la lista aquí.
async function cargarJuegos() {
    if (!(await existeBackend())) {
        pintarJuegos(JUEGOS_POR_DEFECTO);
        registrar('El backend no está compilado. Ejecuta "npm run build" en el proyecto.', true);
        return;
    }

    let motivo;
    let resultado;

    try {
        resultado = await ejecutar(`node ${RUTA_BACKEND} --listar-juegos`);
        const juegos = JSON.parse(resultado.salida.trim());

        if (juegos.length) {
            pintarJuegos(juegos);
            return;
        }

        motivo = 'la lista está vacía';
    } catch (error) {
        motivo = resultado?.error?.trim() || error.message || error;
    }

    pintarJuegos(JUEGOS_POR_DEFECTO);
    registrar(`No se pudo consultar la lista de juegos (${motivo}). Se usa la lista por defecto.`, true);
}

async function existeBackend() {
    try {
        await Neutralino.filesystem.getStats(`${rutas.proyecto}/${RUTA_BACKEND}`);
        return true;
    } catch {
        return false;
    }
}

// --- Acciones ---------------------------------------------------------------

// Descarga los iconos de PokeAPI dentro de pokemon/, en la carpeta elegida. Se
// le pasa la ruta por argumento en vez de leerla de la configuración, para no
// obligar a guardar antes de poder descargar.
async function descargarSprites() {
    const ruta = elementos.rutaRecursos.value;

    if (!ruta) {
        registrar('Elige antes la carpeta de recursos.', true);
        return;
    }

    elementos.btnSprites.disabled = true;
    elementos.btnArrancar.disabled = true;
    registrar(`Descargando sprites en ${ruta}/pokemon ...`);

    try {
        const { codigo } = await ejecutar(`node src/scripts/descargarSprites.mjs --destino="${ruta}"`, {
            alRecibir: (datos, esError) => registrar(datos, esError),
        });

        if (codigo !== 0) {
            registrar(`La descarga falló (código ${codigo}).`, true);
        }
    } catch (error) {
        registrar(`No se pudo lanzar la descarga: ${error.message ?? error}`, true);
    } finally {
        elementos.btnSprites.disabled = false;
        elementos.btnArrancar.disabled = false;
    }
}

async function arrancar() {
    const ajustes = validarFormulario();

    if (!ajustes) {
        return;
    }

    if (!(await existeBackend())) {
        registrar('No existe dist/src/main.js. Ejecuta "npm run build" en el proyecto.', true);
        return;
    }

    try {
        await guardarConfiguracion(ajustes);
    } catch (error) {
        registrar(`No se pudo guardar la configuración: ${error.message ?? error}`, true);
        return;
    }

    const juego = elementos.juego.value;
    detencionSolicitada = false;
    bloquearFormulario(true);
    fijarEstado('arrancando', 'Arrancando...');
    registrar(`Arrancando backend con ${juego}...`);

    try {
        procesoBackend = await Neutralino.os.spawnProcess(
            `node ${RUTA_BACKEND} ${juego}`,
            { cwd: rutas.proyecto }
        );
    } catch (error) {
        procesoBackend = null;
        bloquearFormulario(false);
        fijarEstado('error', 'Error');
        registrar(`No se pudo lanzar el backend: ${error.message ?? error}`, true);
        return;
    }

    escucharProceso(procesoBackend.id, (detalle) => {
        switch (detalle.action) {
            case 'stdOut':
                registrar(detalle.data);

                // El backend avisa cuando los dos servidores están escuchando.
                // Hasta ese momento no se enseñan las URLs: todavía no responden.
                if (detalle.data.includes('PokeObs en marcha')) {
                    fijarEstado('activo', 'En marcha');
                    pintarEndpoints(ajustes.puertoHttp, ajustes.vidasIniciales);
                    mostrarEndpoints(true);
                }
                break;

            case 'stdErr':
                registrar(detalle.data, true);
                break;

            case 'exit':
                dejarDeEscuchar(procesoBackend.id);
                procesoBackend = null;
                bloquearFormulario(false);
                mostrarEndpoints(false);

                // El backend ha podido escribir las vidas restantes mientras
                // corría. Sin releer, el formulario seguiría con los valores de
                // antes de arrancar y los machacaría en el siguiente arranque.
                cargarConfiguracion();

                // Al pararlo nosotros muere por señal, así que su código de
                // salida no distingue un cierre normal de un fallo.
                if (detencionSolicitada || parseInt(detalle.data) === 0) {
                    fijarEstado('parado', 'Parado');
                    registrar('Backend detenido.');
                } else {
                    fijarEstado('error', 'Error');
                    registrar(`El backend terminó con código ${detalle.data}.`, true);
                }
                break;
        }
    });
}

async function parar() {
    if (!procesoBackend) {
        return;
    }

    elementos.btnParar.disabled = true;
    detencionSolicitada = true;
    registrar('Deteniendo backend...');

    try {
        await Neutralino.os.updateSpawnedProcess(procesoBackend.id, 'exit');
    } catch (error) {
        detencionSolicitada = false;
        elementos.btnParar.disabled = false;
        registrar(`No se pudo detener el backend: ${error.message ?? error}`, true);
    }
}

// --- Selector de color ------------------------------------------------------

// El input[type=color] abre el panel nativo del sistema anclado al campo, que en
// una ventana de este tamaño se sale por los bordes. Este selector es un modal
// centrado sobre la ventana atenuada.
const COLORES = [
    '#ffffff', '#c9ced6', '#8a93a3', '#4a5060', '#000000',
    '#ef5350', '#e53935', '#ff7043', '#ffa726', '#ffd54f',
    '#fff176', '#9ccc65', '#66bb6a', '#26a69a', '#26c6da',
    '#42a5f5', '#5c6bc0', '#7e57c2', '#ab47bc', '#ec407a',
];

// Sufijo del campo que se está editando ('Nombre' o 'Vidas'), o null si el
// modal está cerrado.
let editando = null;

function esHexValido(valor) {
    return /^#[0-9a-fA-F]{6}$/.test(valor);
}

function construirPaleta() {
    COLORES.forEach((color) => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.style.background = color;
        boton.title = color;
        boton.addEventListener('click', () => previsualizar(color));
        elementos.paleta.appendChild(boton);
    });
}

function previsualizar(color) {
    elementos.colorHex.value = color;
    elementos.colorPrevia.style.background = color;
    elementos.colorHex.classList.remove('invalido');

    [...elementos.paleta.children].forEach((boton) => {
        boton.classList.toggle('elegido', boton.title.toLowerCase() === color.toLowerCase());
    });
}

function abrirSelector(sufijo) {
    editando = sufijo;
    previsualizar(elementos[`color${sufijo}`].value);
    elementos.selectorColor.classList.remove('oculto');
    elementos.colorHex.focus();
}

function cerrarSelector() {
    editando = null;
    elementos.selectorColor.classList.add('oculto');
}

function aceptarColor() {
    const color = elementos.colorHex.value.trim();

    if (!esHexValido(color)) {
        elementos.colorHex.classList.add('invalido');
        return;
    }

    elementos[`color${editando}`].value = color.toLowerCase();
    pintarMuestra(editando);
    cerrarSelector();
}

// --- Arranque de la GUI -----------------------------------------------------

async function alCerrarVentana() {
    // Sin esto el backend seguiría vivo ocupando los puertos.
    if (procesoBackend) {
        try {
            await Neutralino.os.updateSpawnedProcess(procesoBackend.id, 'exit');
        } catch {
            // La app se cierra igualmente.
        }
    }

    Neutralino.app.exit();
}

Neutralino.init();
Neutralino.events.on('windowClose', alCerrarVentana);

elementos.btnArrancar.addEventListener('click', arrancar);
elementos.btnParar.addEventListener('click', parar);
elementos.btnSprites.addEventListener('click', descargarSprites);
// Las familias genéricas son seis valores fijos del estándar, así que la lista
// se enseña dentro de la app en vez de mandar a nadie a una web.
elementos.enlaceFuentes.addEventListener('click', (evento) => {
    evento.preventDefault();
    elementos.ayudaFuentes.classList.remove('oculto');
});

elementos.ayudaFuentesCerrar.addEventListener('click', () => {
    elementos.ayudaFuentes.classList.add('oculto');
});

elementos.ayudaFuentes.addEventListener('click', (evento) => {
    if (evento.target === elementos.ayudaFuentes) {
        elementos.ayudaFuentes.classList.add('oculto');
    }
});

// El diálogo nativo devuelve la ruta absoluta, que es lo que necesita el
// servidor: nada de rutas relativas a quién arrancó el proceso.
//
// El cerrojo es necesario porque el diálogo se reabría al elegir carpeta: el
// clic que quedó pendiente mientras el diálogo nativo tenía el control se
// entrega al webview justo después de cerrarse, y volvía a disparar el
// manejador. Se suelta con un pequeño retardo para que ese evento tardío caiga
// dentro y se descarte.
let eligiendoCarpeta = false;

elementos.botonRuta.addEventListener('click', async () => {
    if (eligiendoCarpeta) {
        return;
    }

    eligiendoCarpeta = true;

    try {
        const elegida = await Neutralino.os.showFolderDialog('Carpeta con tus imágenes', {
            defaultPath: elementos.rutaRecursos.value || undefined,
        });

        // Cancelar devuelve una cadena vacía: no se pisa lo que ya hubiera.
        if (elegida) {
            elementos.rutaRecursos.value = elegida;
            pintarRuta();
        }
    } finally {
        elementos.botonRuta.blur();
        setTimeout(() => { eligiendoCarpeta = false; }, 400);
    }
});

construirPaleta();
elementos.botonColorNombre.addEventListener('click', () => abrirSelector('Nombre'));
elementos.botonColorVidas.addEventListener('click', () => abrirSelector('Vidas'));
elementos.colorAceptar.addEventListener('click', aceptarColor);
elementos.colorCancelar.addEventListener('click', cerrarSelector);
elementos.colorHex.addEventListener('input', () => {
    if (esHexValido(elementos.colorHex.value.trim())) {
        previsualizar(elementos.colorHex.value.trim());
    }
});

// Cerrar tocando fuera de la caja o con Escape, que es lo que espera cualquiera.
elementos.selectorColor.addEventListener('click', (evento) => {
    if (evento.target === elementos.selectorColor) {
        cerrarSelector();
    }
});

document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && !elementos.ayudaFuentes.classList.contains('oculto')) {
        elementos.ayudaFuentes.classList.add('oculto');
        return;
    }

    if (editando === null) {
        return;
    }

    if (evento.key === 'Escape') {
        cerrarSelector();
    } else if (evento.key === 'Enter') {
        aceptarColor();
    }
});

elementos.btnLimpiar.addEventListener('click', () => {
    elementos.registro.innerHTML = '';
});

(async () => {
    await resolverRutas();
    await cargarConfiguracion();
    await cargarJuegos();

})();
