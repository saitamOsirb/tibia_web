const fs = require("fs");
const otb2json = require("../lib/otb2json");
const parseString = require("xml2js").parseString;

// Carga del XML de items
const xml = fs.readFileSync("items-xml/1098-items.xml").toString();

function loadOTB(filename) {
  /*
   * Carga el items.otb y crea un mapa: serverId -> info
   */
  const map = {};

  const otb = otb2json.read(filename);

  otb.children.forEach((node) => {
    // Aseguramos flags y group como números válidos
    map[node.sid] = {
      id: node.cid,
      flags: typeof node.flags === "number" ? node.flags : 0,
      group: typeof node.group === "number" ? node.group : 0,
      node: node,
      properties: null,
    };
  });

  return map;
}

parseString(xml, function (error, result) {
  if (error !== null) {
    throw error;
  }

  // Carga OTB
  const otb = loadOTB("items-otb/1098-items.otb");

  // Recorre cada <item> del XML
  result.items.item.forEach(function (item) {
    const itemSelf = item["$"];

    // Normalizamos fromid/toid
    if (itemSelf.id) {
      itemSelf.fromid = itemSelf.id;
      itemSelf.toid = itemSelf.id;
    }

    if (!itemSelf.fromid || !itemSelf.toid) {
      return;
    }

    const fromId = Number(itemSelf.fromid);
    const toId = Number(itemSelf.toid);

    for (let i = fromId; i <= toId; i++) {
      // Si el OTB no tiene este sid, lo saltamos
      const entry = otb[String(i)];
      if (!entry) {
        console.warn(
          `rewrite-items-xml: item id ${i} no está en el OTB, se omite al generar definitions.json`
        );
        continue;
      }

      const thing = {
        article: itemSelf.article,
        name: itemSelf.name,
      };

      // Procesar atributos del XML
      if (item.attribute) {
        item.attribute.forEach(function (attribute) {
          const attributeSelf = attribute["$"];
          const key = attributeSelf.key;
          const value = attributeSelf.value;

          // Atributos numéricos
          if (
            [
              "absorbPercentFire",
              "absorbPercentPhysical",
              "absorbPercentEnergy",
              "absorbPercentPoison",
              "absorbPercentLifeDrain",
              "transformDeEquipTo",
              "transformEquipTo",
              "writeOnceItemId",
              "maxTextLen",
              "decayTo",
              "healthGain",
              "healthTicks",
              "manaGain",
              "manaTicks",
              "duration",
              "weight",
              "defense",
              "charges",
              "containerSize",
              "armor",
              "attack",
              "speed",
            ].includes(key)
          ) {
            const num = Number(value);
            thing[key] = Number.isFinite(num) ? num : 0;
          }
          // Atributos booleanos (en XML suelen venir como "0"/"1" o "true"/"false")
          else if (
            [
              "showduration",
              "allowpickupable",
              "blockprojectile",
              "writeable",
              "readable",
              "stopduration",
              "manashield",
              "showcharges",
              "suppressDrunk",
              "preventitemloss",
              "magicpoints",
              "invisible",
            ].includes(key)
          ) {
            const v =
              value === "1" ||
              value === "true" ||
              value === "yes" ||
              value === "on";
            thing[key] = v;
          } else {
            thing[key] = value;
          }
        });
      }

      const grp = typeof entry.group === "number" ? entry.group : 0;
      let flags = typeof entry.flags === "number" ? entry.flags : 0;

      // Tipos especiales según grupo
      if (grp === 0x02) {
        if (thing.type === undefined) {
          thing.type = "container";
        }
      }

      if (grp === 0x0b) {
        thing.type = "splash";
      }

      if (grp === 0x0c) {
        thing.type = "fluidContainer";
      }

      if (grp === 0x06) {
        thing.type = "rune";
      }

      if (thing.hasOwnProperty("corpseType") && thing.hasOwnProperty("containerSize")) {
        thing.type = "corpse";
      }

      // Expertise (hardcode original)
      if (
        [1227, 1228, 1229, 1230, 1245, 1246, 1247, 1248, 1259, 1260, 1261, 1262].includes(
          Number(itemSelf.id)
        )
      ) {
        thing.expertise = true;
      }

      // Unwanted (hardcode original)
      if ([1223, 1224, 1225, 1226].includes(Number(itemSelf.id))) {
        thing.unwanted = true;
      }

      // Vertical
      if (
        [2037, 2038, 1818, 2060, 2061, 2066, 2067].includes(Number(itemSelf.id))
      ) {
        flags += 131072;
      }

      // Horizontal
      if (
        [2039, 2040, 1811, 2058, 2059, 2068, 2069].includes(Number(itemSelf.id))
      ) {
        flags += 262144;
      }

      // Add mailbox
      if (Number(itemSelf.id) === 2593) {
        thing.type = "mailbox";
      }

      // Fix stamped letter
      if (Number(itemSelf.id) === 2598) {
        delete thing.readable;
        thing.type = "readable";
      }

      if ([1811, 1818].includes(Number(itemSelf.id))) {
        flags += 1048576;
      }

      // Readables según flags
      if ((flags & (1 << 14)) || (flags & (1 << 20))) {
        thing.type = "readable";
      }

      // Guardamos flags actualizados y properties
      entry.flags = flags;
      entry.properties = thing;
    }
  });

  // === POST-PROCESADO: asegurar prototipos válidos y tamaños de contenedor ===

  Object.keys(otb).forEach((sid) => {
    const entry = otb[sid];
    if (!entry) return;

    const grp = typeof entry.group === "number" ? entry.group : 0;

    // Si no se generaron properties desde el XML, creamos un prototipo mínimo
    if (!entry.properties) {
      entry.properties = {
        id: entry.id,
        name: `item-${sid}`,
      };

      // Deducción básica de tipo según grupo
      if (grp === 0x02) {
        entry.properties.type = "container";
        entry.properties.containerSize = 10; // tamaño por defecto
      } else if (grp === 0x06) {
        entry.properties.type = "rune";
      } else if (grp === 0x0b) {
        entry.properties.type = "splash";
      } else if (grp === 0x0c) {
        entry.properties.type = "fluidContainer";
      }
    } else {
      // Si es container pero sin containerSize válido, ponemos uno por defecto
      if (entry.properties.type === "container") {
        const size = Number(entry.properties.containerSize);
        if (!Number.isFinite(size) || size <= 0) {
          entry.properties.containerSize = 10; // valor por defecto razonable
        } else {
          entry.properties.containerSize = size;
        }
      }
    }
  });

  // Guardar definitions.json
  fs.writeFileSync("definitions.json", JSON.stringify(otb, null, 4));
});
