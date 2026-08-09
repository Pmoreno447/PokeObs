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
    ipCitra: document.getElementById('ipCitra'),
    puertoCitra: document.getElementById('puertoCitra'),
    estado: document.getElementById('estado'),
    registro: document.getElementById('registro'),
    btnArrancar: document.getElementById('btnArrancar'),
    btnParar: document.getElementById('btnParar'),
    btnCompilar: document.getElementById('btnCompilar'),
    btnLimpiar: document.getElementById('btnLimpiar'),
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
     elementos.ipCitra, elementos.puertoCitra].forEach((campo) => {
        campo.disabled = bloqueado;
    });

    elementos.btnArrancar.disabled = bloqueado;
    elementos.btnCompilar.disabled = bloqueado;
    elementos.btnParar.disabled = !bloqueado;
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
    elementos.ipCitra.value = configuracion.azahar3ds.citraIp;
    elementos.puertoCitra.value = configuracion.azahar3ds.citraPort;
    return true;
}

function leerPuerto(elemento) {
    const valor = Number(elemento.value);
    const valido = Number.isInteger(valor) && valor >= 1 && valor <= 65535;

    elemento.classList.toggle('invalido', !valido);
    return valido ? valor : null;
}

// Devuelve los ajustes del formulario, o null si hay algo inválido.
function validarFormulario() {
    const puertoWebsocket = leerPuerto(elementos.puertoWebsocket);
    const puertoHttp = leerPuerto(elementos.puertoHttp);
    const puertoCitra = leerPuerto(elementos.puertoCitra);
    const ipCitra = elementos.ipCitra.value.trim();

    elementos.ipCitra.classList.toggle('invalido', ipCitra === '');

    if (!puertoWebsocket || !puertoHttp || !puertoCitra || ipCitra === '') {
        registrar('Revisa los campos marcados: los puertos van de 1 a 65535 y la IP no puede estar vacía.', true);
        return null;
    }

    if (puertoWebsocket === puertoHttp) {
        elementos.puertoWebsocket.classList.add('invalido');
        elementos.puertoHttp.classList.add('invalido');
        registrar('El WebSocket y el servidor HTTP no pueden usar el mismo puerto.', true);
        return null;
    }

    return { puertoWebsocket, puertoHttp, ipCitra, puertoCitra };
}

// Reescribe solo los campos que gestiona la GUI para no perder el resto.
async function guardarConfiguracion(ajustes) {
    configuracion.websocket.port = ajustes.puertoWebsocket;
    configuracion.httpServer.port = ajustes.puertoHttp;
    configuracion.azahar3ds.citraIp = ajustes.ipCitra;
    configuracion.azahar3ds.citraPort = ajustes.puertoCitra;

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
        registrar('El backend no está compilado. Pulsa "Compilar" antes de arrancar.', true);
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

async function compilar() {
    elementos.btnCompilar.disabled = true;
    elementos.btnArrancar.disabled = true;
    registrar('Compilando (npm run build)...');

    try {
        const { codigo } = await ejecutar('npm run build', {
            alRecibir: (datos, esError) => registrar(datos, esError),
        });

        if (codigo === 0) {
            registrar('Compilación correcta.');
            await cargarJuegos();
        } else {
            registrar(`La compilación falló (código ${codigo}).`, true);
        }
    } catch (error) {
        registrar(`No se pudo ejecutar npm: ${error.message ?? error}`, true);
    } finally {
        elementos.btnCompilar.disabled = false;
        elementos.btnArrancar.disabled = false;
    }
}

async function arrancar() {
    const ajustes = validarFormulario();

    if (!ajustes) {
        return;
    }

    if (!(await existeBackend())) {
        registrar('No existe dist/src/main.js. Pulsa "Compilar" primero.', true);
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
                if (detalle.data.includes('PokeObs en marcha')) {
                    fijarEstado('activo', 'En marcha');
                }
                break;

            case 'stdErr':
                registrar(detalle.data, true);
                break;

            case 'exit':
                dejarDeEscuchar(procesoBackend.id);
                procesoBackend = null;
                bloquearFormulario(false);

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
elementos.btnCompilar.addEventListener('click', compilar);
elementos.btnLimpiar.addEventListener('click', () => {
    elementos.registro.innerHTML = '';
});

(async () => {
    await resolverRutas();
    await cargarConfiguracion();
    await cargarJuegos();
})();
