import type { LinkMLModel } from '../types/linkml';

export function generateSql(model: LinkMLModel): string {
  let sql = '-- Generated SQL Schema\n\n';
  const junctionTables: string[] = [];

  for (const [className, classDef] of Object.entries(model.classes)) {
    sql += `CREATE TABLE ${className} (\n`;
    
    const columns: string[] = [];
    let hasIdentifier = false;
    
    for (const slotId of classDef.slots) {
      const slot = model.slots[slotId];
      if (!slot) continue;

      const columnName = slot.name || slotId;

      // Handle multivalued slots
      if (slot.multivalued) {
        if (slot.range && model.classes[slot.range]) {
          // It's a relationship. Create a junction table for N:M or 1:N
          const junctionName = `${className}_${columnName}_junction`;
          junctionTables.push(`CREATE TABLE ${junctionName} (
  ${className.toLowerCase()}_id INTEGER REFERENCES ${className}(id),
  ${slot.range.toLowerCase()}_id INTEGER REFERENCES ${slot.range}(id),
  PRIMARY KEY (${className.toLowerCase()}_id, ${slot.range.toLowerCase()}_id)
);\n`);
        } else {
          // Simple multivalued slot (e.g. tag list, scores)
          let itemType = 'TEXT';
          switch (slot.range?.toLowerCase()) {
            case 'integer':
            case 'int':
              itemType = 'INTEGER';
              break;
            case 'float':
            case 'double':
            case 'number':
              itemType = 'DOUBLE PRECISION';
              break;
            case 'decimal':
              itemType = 'NUMERIC';
              break;
            case 'boolean':
            case 'bool':
              itemType = 'BOOLEAN';
              break;
             case 'json':
              itemType = 'JSONB';
              break;
            // date/time arrays are less common but supported in some dbs, defaulting to TEXT[] or specific type is fine
            // keeping simple for now
            default:
              itemType = 'TEXT';
          }
          columns.push(`  ${columnName} ${itemType}[]${slot.required ? ' NOT NULL' : ''}`);
        }
        continue;
      }

      let type = 'TEXT';
      switch (slot.range?.toLowerCase()) {
        case 'string':
          type = 'TEXT';
          break;
        case 'integer':
        case 'int':
          type = 'INTEGER';
          break;
        case 'boolean':
        case 'bool':
          type = 'BOOLEAN';
          break;
        case 'float':
        case 'double':
        case 'number':
          type = 'DOUBLE PRECISION';
          break;
        case 'decimal':
          type = 'NUMERIC';
          break;
        case 'date':
          type = 'DATE';
          break;
        case 'datetime':
          type = 'TIMESTAMP';
          break;
        case 'time':
          type = 'TIME';
          break;
        case 'json':
          type = 'JSONB';
          break;
        default:
          if (model.classes[slot.range || '']) {
            type = 'INTEGER'; // Assuming FK
          }
      }

      let colDef = `  ${columnName} ${type}`;
      
      if (slot.required) {
        colDef += ' NOT NULL';
      }
      
      if (slot.identifier) {
        colDef += ' PRIMARY KEY';
        hasIdentifier = true;
      }

      columns.push(colDef);
    }

    if (!hasIdentifier) {
      if (!columns.some(c => c.includes(' id '))) {
         columns.unshift('  id SERIAL PRIMARY KEY');
      }
    }

    sql += columns.join(',\n');
    sql += '\n);\n\n';
  }

  if (junctionTables.length > 0) {
    sql += '-- Junction Tables for Relationships\n';
    sql += junctionTables.join('\n');
  }

  return sql;
}
