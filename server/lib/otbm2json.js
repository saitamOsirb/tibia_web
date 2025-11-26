const fs = require("fs");
const path = require("path");
const HEADERS = require("./headers");

const NODE_ESC = 0xFD;
const NODE_INIT = 0xFE;
const NODE_TERM = 0xFF;

__VERSION__ = "1.0.1";

// === LOG A ARCHIVO SOLO PARA ESTE MÓDULO ===
const LOG_FILE = path.join(__dirname, "otbm2json.log.txt");

function logLine(...args) {
  const msg = args
    .map(a => {
      if (a instanceof Error) return a.stack || a.toString();
      if (typeof a === "object") return JSON.stringify(a);
      return String(a);
    })
    .join(" ");

  const line = `[${new Date().toISOString()}] ${msg}\n`;

  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    // Si falla el log a disco, al menos lo vemos en consola
    console.error("No se pudo escribir en el log de otbm2json:", e);
  }
}
// ==========================================

function writeOTBM(__OUTFILE__, data) {

  /*
   * Function writeOTBM
   * Writes OTBM from intermediary JSON structure
   */

  // Write all nodes
  fs.writeFileSync(__OUTFILE__, serializeOTBM(data));

}

function serializeOTBM(data) {

  /*
   * Function serializeOTBM
   * Serializes OTBM from intermediary JSON structure
   */

  function writeNode(node) {

    /* FUNCTION writeNode
     * Recursively writes all JSON nodes to OTBM node structure
     */

    // Concatenate own data with children (recursively)
    // and pad the node with start & end identifier
    return Buffer.concat([
      Buffer.from([NODE_INIT]),
      writeElement(node),
      Buffer.concat(getChildNode(node).map(writeNode)),
      Buffer.from([NODE_TERM])
    ]);

  }

  function getChildNode(node) {

    /* FUNCTION getChildNode
     * Returns child node or dummy array if child does not exist
     */

    return getChildNodeReal(node) || new Array();

  }

  function getChildNodeReal(node) {

    /* FUNCTION getChildNodeReal
     * Give children of a node a particular identifier
     */

    switch (node.type) {
      case HEADERS.OTBM_TILE_AREA:
        return node.tiles;
      case HEADERS.OTBM_TILE:
      case HEADERS.OTBM_HOUSETILE:
        return node.items;
      case HEADERS.OTBM_TOWNS:
        return node.towns;
      case HEADERS.OTBM_ITEM:
        return node.content;
      case HEADERS.OTBM_MAP_DATA:
        return node.features;
      default:
        return node.nodes;
    }

  }

  function writeElement(node) {

    /* FUNCTION Node.setChildren
     * Give children of a node a particular identifier
     */

    var buffer;

    // Write each node type
    switch (node.type) {
      case HEADERS.OTBM_MAP_HEADER:
        buffer = Buffer.alloc(17);
        buffer.writeUInt8(HEADERS.OTBM_MAP_HEADER, 0);
        buffer.writeUInt32LE(node.version, 1);
        buffer.writeUInt16LE(node.mapWidth, 5);
        buffer.writeUInt16LE(node.mapHeight, 7);
        buffer.writeUInt32LE(node.itemsMajorVersion, 9);
        buffer.writeUInt32LE(node.itemsMinorVersion, 13);
        break;
      case HEADERS.OTBM_MAP_DATA:
        buffer = Buffer.alloc(1);
        buffer.writeUInt8(HEADERS.OTBM_MAP_DATA, 0);
        buffer = Buffer.concat([buffer, writeAttributes(node)]);
        break;
      case HEADERS.OTBM_TILE_AREA:
        buffer = Buffer.alloc(6);
        buffer.writeUInt8(HEADERS.OTBM_TILE_AREA, 0);
        buffer.writeUInt16LE(node.x, 1);
        buffer.writeUInt16LE(node.y, 3);
        buffer.writeUInt8(node.z, 5);
        break;
      case HEADERS.OTBM_TILE:
        buffer = Buffer.alloc(3);
        buffer.writeUInt8(HEADERS.OTBM_TILE, 0);
        buffer.writeUInt8(node.x, 1);
        buffer.writeUInt8(node.y, 2);
        buffer = Buffer.concat([buffer, writeAttributes(node)]);
        break;
      case HEADERS.OTBM_HOUSETILE:
        buffer = Buffer.alloc(7);
        buffer.writeUInt8(HEADERS.OTBM_HOUSETILE, 0);
        buffer.writeUInt8(node.x, 1);
        buffer.writeUInt8(node.y, 2);
        buffer.writeUInt32LE(node.houseId, 3);
        buffer = Buffer.concat([buffer, writeAttributes(node)]);
        break;
      case HEADERS.OTBM_ITEM:
        buffer = Buffer.alloc(3);
        buffer.writeUInt8(HEADERS.OTBM_ITEM, 0);
        buffer.writeUInt16LE(node.id, 1);
        buffer = Buffer.concat([buffer, writeAttributes(node)]);
        break;
      case HEADERS.OTBM_WAYPOINT:
        buffer = Buffer.alloc(3 + node.name.length + 5);
        buffer.writeUInt8(HEADERS.OTBM_WAYPOINT, 0);
        buffer.writeUInt16LE(node.name.length, 1)
        buffer.write(node.name, 3, "ASCII");
        buffer.writeUInt16LE(node.x, 3 + node.name.length);
        buffer.writeUInt16LE(node.y, 3 + node.name.length + 2);
        buffer.writeUInt8(node.z, 3 + node.name.length + 4);
        break;
      case HEADERS.OTBM_WAYPOINTS:
        buffer = Buffer.alloc(1);
        buffer.writeUInt8(HEADERS.OTBM_WAYPOINTS, 0);
        break;
      case HEADERS.OTBM_TOWNS:
        buffer = Buffer.alloc(1);
        buffer.writeUInt8(HEADERS.OTBM_TOWNS, 0);
        break;
      case HEADERS.OTBM_TOWN:
        buffer = Buffer.alloc(7 + node.name.length + 5);
        buffer.writeUInt8(HEADERS.OTBM_TOWN, 0);
        buffer.writeUInt32LE(node.townid, 1);
        buffer.writeUInt16LE(node.name.length, 5)
        buffer.write(node.name, 7, "ASCII");
        buffer.writeUInt16LE(node.x, 7 + node.name.length);
        buffer.writeUInt16LE(node.y, 7 + node.name.length + 2);
        buffer.writeUInt8(node.z, 7 + node.name.length + 4);
        break;
      default:
        throw ("Could not write node. Unknown node type: " + node.type);
    }

    return escapeCharacters(buffer);

  }

  function escapeCharacters(buffer) {

    /* FUNCTION escapeCharacters
     * Escapes special 0xFD, 0xFE, 0xFF characters in buffer
     */

    for (var i = 0; i < buffer.length; i++) {
      if (buffer.readUInt8(i) === NODE_TERM || buffer.readUInt8(i) === NODE_INIT || buffer.readUInt8(i) === NODE_ESC) {
        buffer = Buffer.concat([buffer.slice(0, i), Buffer.from([NODE_ESC]), buffer.slice(i)]); i++;
      }
    }

    return buffer;

  }

  function writeASCIIString16LE(string) {

    /* FUNCTION writeASCIIString16LE
     * Writes an ASCII string prefixed with its string length (2 bytes)
     */

    var buffer = Buffer.alloc(2 + string.length);
    buffer.writeUInt16LE(string.length, 0);
    buffer.write(string, 2, string.length, "ASCII");
    return buffer;

  }

  function writeAttributes(node) {

    /* FUNCTION writeAttributes
     * Writes additional node attributes
     */

    var buffer;
    var attributeBuffer = Buffer.alloc(0);

    if (node.destination) {
      buffer = Buffer.alloc(6);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_TELE_DEST);
      buffer.writeUInt16LE(node.destination.x, 1);
      buffer.writeUInt16LE(node.destination.y, 3);
      buffer.writeUInt8(node.destination.z, 5);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer]);
    }

    // Write description property
    if (node.description) {
      buffer = Buffer.alloc(1);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_DESCRIPTION, 0);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer, writeASCIIString16LE(node.description)])
    }

    // Node has an unique identifier
    if (node.uid) {
      buffer = Buffer.alloc(3);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_UNIQUE_ID, 0);
      buffer.writeUInt16LE(node.uid, 1);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer]);
    }

    // Node has an action identifier
    if (node.aid) {
      buffer = Buffer.alloc(3);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_ACTION_ID, 0);
      buffer.writeUInt16LE(node.aid, 1);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer]);
    }

    // Node has rune charges
    if (node.runeCharges) {
      buffer = Buffer.alloc(3);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_RUNE_CHARGES);
      buffer.writeUInt16LE(node.runeCharges, 1);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer]);
    }

    // Spawn file
    if (node.spawnfile) {
      buffer = Buffer.alloc(1);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_EXT_SPAWN_FILE, 0);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer, writeASCIIString16LE(node.spawnfile)])
    }

    // Text attribute
    if (node.text) {
      buffer = Buffer.alloc(1);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_TEXT, 0);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer, writeASCIIString16LE(node.text)])
    }

    // House file
    if (node.housefile) {
      buffer = Buffer.alloc(1);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_EXT_HOUSE_FILE, 0);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer, writeASCIIString16LE(node.housefile)])
    }

    // External map file (por si lo usas al escribir)
    if (node.extfile) {
      buffer = Buffer.alloc(1);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_EXT_FILE, 0);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer, writeASCIIString16LE(node.extfile)])
    }

    // Write HEADERS.OTBM_ATTR_ITEM
    if (node.tileid) {
      buffer = Buffer.alloc(3);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_ITEM, 0);
      buffer.writeUInt16LE(node.tileid, 1);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer]);
    }

    // Write node count
    if (node.count) {
      buffer = Buffer.alloc(2);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_COUNT, 0);
      buffer.writeUInt8(node.count, 1);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer]);
    }

    // Write depot identifier
    if (node.depotId) {
      buffer = Buffer.alloc(3);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_DEPOT_ID, 0);
      buffer.writeUInt16LE(node.depotId, 1);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer]);
    }

    // Write house door ID
    if (node.houseDoorId) {
      buffer = Buffer.alloc(2);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_HOUSEDOORID, 0);
      buffer.writeUInt8(node.houseDoorId, 1);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer]);
    }

    // Write the zone fields
    if (node.zones) {
      buffer = Buffer.alloc(5);
      buffer.writeUInt8(HEADERS.OTBM_ATTR_TILE_FLAGS, 0);
      buffer.writeUInt32LE(writeFlags(node.zones), 1);
      attributeBuffer = Buffer.concat([attributeBuffer, buffer]);
    }

    return attributeBuffer;

  }

  function writeFlags(zones) {

    /* FUNCTION writeFlags
     * Writes OTBM tile bit-flags to integer
     */

    var flags = HEADERS.TILESTATE_NONE;

    flags |= zones.protection && HEADERS.TILESTATE_PROTECTIONZONE;
    flags |= zones.noPVP && HEADERS.TILESTATE_NOPVP;
    flags |= zones.noLogout && HEADERS.TILESTATE_NOLOGOUT;
    flags |= zones.PVPZone && HEADERS.TILESTATE_PVPZONE;
    flags |= zones.refresh && HEADERS.TILESTATE_REFRESH;

    return flags;

  }

  // OTBM Header
  const VERSION = Buffer.alloc(4).fill(0x00);

  // Write all nodes
  return Buffer.concat([VERSION, writeNode(data.data)]);

}

function readOTBM(__INFILE__, map) {

  /* FUNCTION readOTBM
   * Reads OTBM file to intermediary JSON structure
   */

  var Node = function (data, children) {

    /* CLASS Node
     * Holds a particular OTBM node of type (see below)
     */

    // Remove the escape character from the node data string
    data = this.removeEscapeCharacters(data);

    switch (data.readUInt8(0)) {

      case HEADERS.OTBM_MAP_HEADER:
        this.type = HEADERS.OTBM_MAP_HEADER;
        this.version = data.readUInt32LE(1);
        this.mapWidth = data.readUInt16LE(5);
        this.mapHeight = data.readUInt16LE(7);
        this.itemsMajorVersion = data.readUInt32LE(9);
        this.itemsMinorVersion = data.readUInt32LE(13);
        break;

      // High level map data (e.g. areas, towns, and waypoints)
      case HEADERS.OTBM_MAP_DATA:
        this.type = HEADERS.OTBM_MAP_DATA;
        Object.assign(this, readAttributes(data.slice(1)));
        break;

      // A tile area
      case HEADERS.OTBM_TILE_AREA:
        this.type = HEADERS.OTBM_TILE_AREA;
        this.x = data.readUInt16LE(1);
        this.y = data.readUInt16LE(3);
        this.z = data.readUInt8(5);
        break;

      // A specific tile at location inside the parent tile area
      case HEADERS.OTBM_TILE:
        this.type = HEADERS.OTBM_TILE;
        this.x = data.readUInt8(1);
        this.y = data.readUInt8(2);
        Object.assign(this, readAttributes(data.slice(3)));
        break;

      // A specific item inside the parent tile
      case HEADERS.OTBM_ITEM:
        this.type = HEADERS.OTBM_ITEM;
        this.id = data.readUInt16LE(1);

        // We need to use both OTB and OTBM to support older versions: crazy right?!
        if (version === 0 && map[this.id].isStackable() || map[this.id].isSplash() || map[this.id].isFluidContainer()) {
          this.count = data.readUInt8(3);
          Object.assign(this, readAttributes(data.slice(4)));
        } else {
          Object.assign(this, readAttributes(data.slice(3)));
        }

        break;

      // Parse HEADERS.OTBM_HOUSETILE entity
      case HEADERS.OTBM_HOUSETILE:
        this.type = HEADERS.OTBM_HOUSETILE;
        this.x = data.readUInt8(1);
        this.y = data.readUInt8(2);
        this.houseId = data.readUInt32LE(3);
        Object.assign(this, readAttributes(data.slice(7)));
        break;

      // Parse HEADERS.OTBM_WAYPOINTS structure
      case HEADERS.OTBM_WAYPOINTS:
        this.type = HEADERS.OTBM_WAYPOINTS;
        break;

      // Single waypoint entity
      case HEADERS.OTBM_WAYPOINT:
        this.type = HEADERS.OTBM_WAYPOINT;
        this.name = readASCIIString16LE(data.slice(1));
        this.x = data.readUInt16LE(3 + this.name.length);
        this.y = data.readUInt16LE(5 + this.name.length);
        this.z = data.readUInt8(7 + this.name.length);
        break;

      // Parse HEADERS.OTBM_TOWNS
      case HEADERS.OTBM_TOWNS:
        this.type = HEADERS.OTBM_TOWNS;
        break;

      // Single town entity
      case HEADERS.OTBM_TOWN:
        this.type = HEADERS.OTBM_TOWN;
        this.townid = data.readUInt32LE(1);
        this.name = readASCIIString16LE(data.slice(5));
        this.x = data.readUInt16LE(7 + this.name.length);
        this.y = data.readUInt16LE(9 + this.name.length);
        this.z = data.readUInt8(11 + this.name.length);
        break;
    }

    // Set node children
    if (children.length) {
      this.setChildren(children);
    }

  }

  Node.prototype.removeEscapeCharacters = function (nodeData) {

    /* FUNCTION removeEscapeCharacter
     * Removes 0xFD escape character from the byte string
     */

    var iEsc = 0;
    var index;

    while (true) {

      // Find the next escape character
      index = nodeData.slice(++iEsc).indexOf(NODE_ESC);

      // No more: stop iteration
      if (index === -1) {
        return nodeData;
      }

      iEsc = iEsc + index;

      // Remove the character from the buffer
      nodeData = Buffer.concat([
        nodeData.slice(0, iEsc),
        nodeData.slice(iEsc + 1)
      ]);

    }

  };

  Node.prototype.setChildren = function (children) {

    /* FUNCTION Node.setChildren
     * Give children of a node a particular identifier
     */

    switch (this.type) {
      case HEADERS.OTBM_TILE_AREA:
        this.tiles = children;
        break;
      case HEADERS.OTBM_TILE:
      case HEADERS.OTBM_HOUSETILE:
        this.items = children;
        break;
      case HEADERS.OTBM_TOWNS:
        this.towns = children;
        break;
      case HEADERS.OTBM_ITEM:
        this.content = children;
        break;
      case HEADERS.OTBM_MAP_DATA:
        this.features = children;
        break;
      default:
        this.nodes = children;
        break;
    }

  };

  function readASCIIString16LE(data) {
    if (!data || data.length < 2) {
      const msg = "readASCIIString16LE: buffer demasiado corto (" + (data ? data.length : 0) + " bytes), devolviendo cadena vacía.";
      console.warn(msg);
      logLine(msg);
      return "";
    }

    const declaredLen = data.readUInt16LE(0);

    if (data.length < 2 + declaredLen) {
      const msg = "readASCIIString16LE: longitud declarada " + declaredLen + " mayor que el buffer (" + data.length + "), truncando.";
      console.warn(msg);
      logLine(msg);
      return data.slice(2).toString("ascii");
    }

    return data.slice(2, 2 + declaredLen).toString("ascii");
  }

  function readAttributes(data) {

    /* FUNCTION readAttributes
     * Parses a node's attribute structure
     */

    let i = 0;
    const properties = {};

    // helper para leer string prefijada con uint16
    function readStringAttr(attrName) {
      const remaining = data.length - i;

      // Caso normal: no quedan bytes -> fin de atributos sin log
      if (remaining === 0) {
        i = data.length;
        return "";
      }

      // Hay 1 byte pero necesitamos al menos 2 para la longitud -> raro de verdad
      if (remaining < 2) {
        const msg = `readAttributes: ${attrName} sin espacio para longitud (quedan ${remaining} bytes), corto lectura de atributos.`;
        console.warn(msg);
        logLine(msg);
        i = data.length;
        return "";
      }

      const len = data.readUInt16LE(i);

      // Hay algo pero no alcanza para toda la cadena -> buffer cortado
      if (remaining < 2 + len) {
        const msg = `readAttributes: ${attrName} longitud declarada ${len} mayor que bytes restantes (${remaining}), corto lectura de atributos.`;
        console.warn(msg);
        logLine(msg);
        i = data.length;
        return "";
      }

      const str = data.slice(i + 2, i + 2 + len).toString("ascii");
      i += 2 + len;
      return str;
    }

    while (i < data.length) {
      const attr = data.readUInt8(i++);
      const remaining = data.length - i;

      switch (attr) {

        // Text is written
        case HEADERS.OTBM_ATTR_TEXT:
          properties.text = readStringAttr("OTBM_ATTR_TEXT");
          break;

        // Spawn file name
        case HEADERS.OTBM_ATTR_EXT_SPAWN_FILE:
          properties.spawnfile = readStringAttr("OTBM_ATTR_EXT_SPAWN_FILE");
          break;

        // House file name
        case HEADERS.OTBM_ATTR_EXT_HOUSE_FILE:
          properties.housefile = readStringAttr("OTBM_ATTR_EXT_HOUSE_FILE");
          break;

        // External map file
        case HEADERS.OTBM_ATTR_EXT_FILE:
          properties.extfile = readStringAttr("OTBM_ATTR_EXT_FILE");
          break;

        // House door identifier (1 byte)
        case HEADERS.OTBM_ATTR_HOUSEDOORID:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 1) {
            const msg = `OTBM_ATTR_HOUSEDOORID: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.houseDoorId = data.readUInt8(i);
          i += 1;
          break;

        // Description is written (N bytes) – may be written multiple times
        case HEADERS.OTBM_ATTR_DESCRIPTION: {
          const descriptionString = readStringAttr("OTBM_ATTR_DESCRIPTION");
          if (!descriptionString) break;
          if (properties.description) {
            properties.description += " " + descriptionString;
          } else {
            properties.description = descriptionString;
          }
          break;
        }

        // Alternative description/text
        case HEADERS.OTBM_ATTR_DESC:
          properties.text = readStringAttr("OTBM_ATTR_DESC");
          break;

        // Depot identifier (2 bytes)
        case HEADERS.OTBM_ATTR_DEPOT_ID:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 2) {
            const msg = `OTBM_ATTR_DEPOT_ID: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.depotId = data.readUInt16LE(i);
          i += 2;
          break;

        // Tile flags indicating the type of tile (4 bytes)
        case HEADERS.OTBM_ATTR_TILE_FLAGS:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 4) {
            const msg = `OTBM_ATTR_TILE_FLAGS: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.zones = readFlags(data.readUInt32LE(i));
          i += 4;
          break;

        // Rune charges (2 bytes)
        case HEADERS.OTBM_ATTR_RUNE_CHARGES:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 2) {
            const msg = `OTBM_ATTR_RUNE_CHARGES: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.runeCharges = data.readUInt16LE(i);
          i += 2;
          break;

        // Item count (1 byte)
        case HEADERS.OTBM_ATTR_COUNT:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 1) {
            const msg = `OTBM_ATTR_COUNT: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.count = data.readUInt8(i);
          i += 1;
          break;

        // Main item identifier (2 bytes)
        case HEADERS.OTBM_ATTR_ITEM:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 2) {
            const msg = `OTBM_ATTR_ITEM: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.tileid = data.readUInt16LE(i);
          i += 2;
          break;

        // Action identifier (2 bytes)
        case HEADERS.OTBM_ATTR_ACTION_ID:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 2) {
            const msg = `OTBM_ATTR_ACTION_ID: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.aid = data.readUInt16LE(i);
          i += 2;
          break;

        // Unique identifier (2 bytes)
        case HEADERS.OTBM_ATTR_UNIQUE_ID:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 2) {
            const msg = `OTBM_ATTR_UNIQUE_ID: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.uid = data.readUInt16LE(i);
          i += 2;
          break;

        // Teleporter destination (x, y, z) -> 2 + 2 + 1 bytes
        case HEADERS.OTBM_ATTR_TELE_DEST:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 5) {
            const msg = `OTBM_ATTR_TELE_DEST: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.destination = {
            x: data.readUInt16LE(i),
            y: data.readUInt16LE(i + 2),
            z: data.readUInt8(i + 4)
          };
          i += 5;
          break;

        // Duración (4 bytes, int32)
        case HEADERS.OTBM_ATTR_DURATION:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 4) {
            const msg = `OTBM_ATTR_DURATION: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.duration = data.readInt32LE(i);
          i += 4;
          break;

        // Estado de decaimiento (1 byte)
        case HEADERS.OTBM_ATTR_DECAYING_STATE:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 1) {
            const msg = `OTBM_ATTR_DECAYING_STATE: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.decayingState = data.readUInt8(i);
          i += 1;
          break;

        // Fecha escrita (4 bytes, uint32)
        case HEADERS.OTBM_ATTR_WRITTENDATE:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 4) {
            const msg = `OTBM_ATTR_WRITTENDATE: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.writtenDate = data.readUInt32LE(i);
          i += 4;
          break;

        // Autor (string)
        case HEADERS.OTBM_ATTR_WRITTENBY:
          properties.writtenBy = readStringAttr("OTBM_ATTR_WRITTENBY");
          break;

        // Sleeper GUID (4 bytes)
        case HEADERS.OTBM_ATTR_SLEEPERGUID:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 4) {
            const msg = `OTBM_ATTR_SLEEPERGUID: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.sleeperGuid = data.readUInt32LE(i);
          i += 4;
          break;

        // Sleep start (4 bytes)
        case HEADERS.OTBM_ATTR_SLEEPSTART:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 4) {
            const msg = `OTBM_ATTR_SLEEPSTART: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.sleepStart = data.readUInt32LE(i);
          i += 4;
          break;

        // Charges (2 bytes)
        case HEADERS.OTBM_ATTR_CHARGES:
          if (remaining === 0) { i = data.length; break; }
          if (remaining < 2) {
            const msg = `OTBM_ATTR_CHARGES: quedan ${remaining} bytes, corto lectura de atributos.`;
            console.warn(msg);
            logLine(msg);
            i = data.length;
            break;
          }
          properties.charges = data.readUInt16LE(i);
          i += 2;
          break;

        default:
          // attr == 0 no es un atributo válido: lo tratamos como padding / fin de atributos, sin log
          if (attr === 0) {
            i = data.length;
            break;
          }

          // Si no quedan bytes, también lo tratamos como fin normal de atributos
          if (remaining === 0) {
            i = data.length;
            break;
          }

          // Cualquier otro atributo desconocido con bytes restantes sí se loguea
          const msg = `Atributo OTBM desconocido: ${attr} bytes restantes: ${remaining} -> dejo de leer atributos de este nodo.`;
          console.warn(msg);
          logLine(msg);
          i = data.length;
          break;
      }
    }

    return properties;

  }


  function readFlags(flags) {
    return {
      protection: flags & HEADERS.TILESTATE_PROTECTIONZONE ? HEADERS.TILESTATE_PROTECTIONZONE : 0,
      noPVP: flags & HEADERS.TILESTATE_NOPVP ? HEADERS.TILESTATE_NOPVP : 0,
      noLogout: flags & HEADERS.TILESTATE_NOLOGOUT ? HEADERS.TILESTATE_NOLOGOUT : 0,
      PVPZone: flags & HEADERS.TILESTATE_PVPZONE ? HEADERS.TILESTATE_PVPZONE : 0,
      refresh: 0 // en mapas 10.x no se usa, lo dejamos siempre a 0
    };
  }

  /*function readFlags(flags) {

    // FUNCTION readFlags
    // Reads OTBM bit flags
    //

    // Read individual tile flags using bitwise AND &
    return {
      "protection": flags & HEADERS.TILESTATE_PROTECTIONZONE,
      "noPVP": flags & HEADERS.TILESTATE_NOPVP,
      "noLogout": flags & HEADERS.TILESTATE_NOLOGOUT,
      "PVPZone": flags & HEADERS.TILESTATE_PVPZONE,
      "refresh": flags & HEADERS.TILESTATE_REFRESH
    }

  }*/

  function readNode(data) {

    /* FUNCTION readNode
     * Recursively parses OTBM nodal tree structure
     */

    // Cut off the initializing 0xFE identifier
    data = data.slice(1);

    var i = 0;
    var children = new Array();
    var nodeData = null;
    var child;

    // Start reading the array
    while (i < data.length) {

      var cByte = data.readUInt8(i);

      // Data belonging to the parent node, between 0xFE and (OxFE || 0xFF)
      if (nodeData === null && (cByte === NODE_INIT || cByte === NODE_TERM)) {
        nodeData = data.slice(0, i);
      }

      // Escape character: skip reading this and following byte
      if (cByte === NODE_ESC) {
        i = i + 2;
        continue;
      }

      // A new node is started within another node: recursion
      if (cByte === NODE_INIT) {
        child = readNode(data.slice(i));
        children.push(child.node);

        // Skip index over full child length
        i = i + 2 + child.i;
        continue;
      }

      // Node termination
      if (cByte === NODE_TERM) {
        return {
          "node": new Node(nodeData, children),
          "i": i
        }
      }

      i++;

    }

  }

  const data = fs.readFileSync(__INFILE__);

  // Read ahead to get the OTBM version..
  let version = data.readUInt32LE(6);

  // First four magic bytes are the format identifier
  const MAP_IDENTIFIER = data.readUInt32LE(0);

  // Confirm OTBM format by reading magic bytes (NULL or "OTBM")
  if (MAP_IDENTIFIER !== 0x00000000 && MAP_IDENTIFIER !== 0x4D42544F) {
    throw ("Unknown OTBM format: unexpected magic bytes.");
  }

  // Create an object to hold the data
  var mapData = {
    "version": __VERSION__,
    "identifier": MAP_IDENTIFIER,
    "data": readNode(data.slice(4)).node
  }

  return mapData;

}

module.exports.read = readOTBM;
module.exports.write = writeOTBM;
module.exports.serialize = serializeOTBM;
module.exports.HEADERS = HEADERS;
module.exports.__VERSION__ = __VERSION__;
