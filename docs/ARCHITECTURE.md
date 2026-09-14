# Cómo funciona PokeObs

PokeObs lee la memoria del emulador y publica los datos de la partida (medallas,
equipo y vidas) para que OBS los muestre como fuentes de navegador. La
aplicación se usa desde la GUI, que guarda la configuración y arranca el backend.

Esta guía resume la estructura del código y los pasos para ampliarlo.

> El diagrama de componentes y las fases del proyecto están en [roadmap.md](roadmap.md).

---

## Estructura del proyecto

```text
src/
├── config/
│   ├── argumentos.ts              # lectura de opciones --nombre=valor
│   ├── constants.ts
│   ├── paths.ts                   # rutas en desarrollo y en el ejecutable
│   └── userConfig/
│       ├── userConfig.json        # configuración del usuario
│       └── userConfig.ts          # acceso tipado a la configuración
├── emulators/
│   ├── gameModule.ts              # contrato común de todos los juegos
│   ├── gameRegistry.ts            # registro de juegos disponibles
│   └── azahar3ds/                 # un directorio por emulador
│       ├── azaharConnection.ts    # conexión con el emulador
│       ├── azaharUtils.ts         # descifrado de datos de Pokémon
│       └── games/
│           └── xy.ts              # un módulo por juego
├── resources/
│   ├── html/                      # plantillas de los overlays
│   └── img/                       # imágenes de ejemplo (medallas/, pokemon/, vida/)
├── scripts/
│   └── empaquetarBackend.mjs      # genera el ejecutable del backend
├── contadorVidas.ts
├── descargarSprites.ts            # descarga de iconos desde PokeAPI
├── httpServer.ts
├── overlayServer.ts
├── plantillas.ts                  # lee las plantillas (disco o ejecutable)
└── main.ts
```

---

## Módulos principales

| Módulo | Responsabilidad |
|---|---|
| `main.ts` | Punto de entrada que lanza la GUI. Recibe el juego elegido y arranca los servidores. |
| `overlayServer.ts` | Consulta el juego activo cada segundo y envía los datos por WebSocket. |
| `httpServer.ts` | Sirve las plantillas HTML que OBS carga como fuentes de navegador. |
| `contadorVidas.ts` | Lleva la cuenta de vidas de un Nuzlocke (ver [Contador de vidas](#contador-de-vidas)). |
| `config/` | Configuración del usuario, compartida entre la GUI y el backend. |
| `emulators/` | Todo lo que depende del emulador y del juego. **Es la parte que se amplía.** |

Los módulos de la raíz de `src/` no deberían necesitar cambios al añadir juegos.
Solo hay que tocarlos si se quiere exponer un tipo de dato nuevo.

### Configuración

`userConfig.json` guarda:

- **Puertos** del servidor WebSocket y del servidor HTTP.
- **IP y puerto del emulador.**
- **Vidas** totales y restantes. Las totales determinan cuántos iconos de vida se exponen.
- **Ruta de recursos**: carpeta de donde se sirven las imágenes.
- **Estilos** de texto para los overlays.

### Contador de vidas

Resta una vida cuando los PS de un Pokémon pasan a 0. Algunos matices:

- Identifica a cada Pokémon por su **PID**, así que reordenar el equipo no cuenta como muerte.
- Un Pokémon que **ya estaba a 0 PS al arrancar** no resta vida: se asume que es de una sesión anterior.
- La cuenta **se guarda en cada muerte** y se conserva al cerrar la aplicación.

### Endpoints para OBS

| Endpoint | Muestra |
|---|---|
| `/medallas/1` … `/medallas/8` | Una medalla, en color si se tiene y en gris si no. |
| `/pokemon/1/imagen` … `/pokemon/6/imagen` | Imagen de la especie del Pokémon de ese hueco. |
| `/pokemon/1/nombre` … `/pokemon/6/nombre` | Mote del Pokémon de ese hueco. |
| `/vidas` | Número de vidas restantes. |
| `/vidas/1` … `/vidas/N` | Un icono por vida, en color o en gris según se conserve. |

---

## Capa de emuladores

Esta es la parte que hay que conocer para añadir soporte a nuevos juegos.

### `gameModule.ts`

Contrato común de todos los juegos. Cada módulo de juego expone una función
fábrica que devuelve un `GameModule` con su nombre y las lecturas que sabe hacer.
Las lecturas son opcionales: las que un juego no implementa simplemente no se
ofrecen.

```ts
export interface GameModule {
    nombre: string;
    leerMedallas?: () => Promise<number | null>;
    leerPokemon?: (slot: number) => Promise<PokemonLeido | null>;   // slot 0-5
}
```

### `gameRegistry.ts`

Registro de los juegos disponibles. Cada entrada asocia un identificador (juego
y versión) con la fábrica de su módulo. La GUI obtiene de aquí la lista de
juegos, y solo se construye el módulo del juego elegido.

### Conexión con el emulador

Cada emulador tiene su propio módulo de conexión, que abstrae el envío de
peticiones y la recepción de datos. Hoy existe `azaharConnection.ts`, que expone
`readMemory(direccion, tamaño)`.

### Módulos de juego

Cada juego tiene su propio fichero, que usa la conexión de su emulador para leer
la información. Aunque dos juegos compartan funciones (por ejemplo, Rubí Omega
podría importar las de X/Y), cada uno va en un fichero separado para que sus
direcciones de memoria estén localizadas y sean fáciles de modificar.

> **Decisión de diseño.** Un único `procesarPokemon` devuelve a la vez especie,
> mote y PS. Puede parecer acoplamiento, pero al leer un Pokémon se obtienen los
> tres datos de una vez; separarlos en funciones distintas solo repetiría lecturas
> y código.

---

## Añadir un juego nuevo

```text
emuladorConnection (si hace falta)  →  <juego>.ts  →  registro en gameRegistry
```

1. **Conexión** *(solo si el emulador es nuevo)*. Crea el módulo de conexión en
   `src/emulators/<emulador>/`.
2. **Módulo del juego**. Crea `src/emulators/<emulador>/games/<juego>.ts` con una
   fábrica que devuelva un `GameModule`.
3. **Registro**. Añade la entrada en `gameRegistry.ts`:

   ```ts
   "PokemonXY-1.0": () => crearXY("1.0"),
   ```

Con eso el juego aparece en la GUI y todos los overlays funcionan.

### Qué debe devolver cada lectura

| Función | Devuelve |
|---|---|
| `procesarMedallas` | Número entero de medallas, de `0` a `8`. |
| `procesarPokemon` | `pid` (número), `especie` (número de Pokédex), `nombre` (mote, texto) y `hp` como `{ actual: número }`. |

En ambos casos se devuelve `null` si la lectura falla; en `procesarPokemon`,
también si el hueco del equipo está vacío.
