const fs = require('fs');
const path = require('path');

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.dto.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');

      // regex to match @ApiProperty() and the following property definition
      const regex = /(@ApiProperty\(\s*\))\s+([a-zA-Z0-9_]+)[!?]?:\s*(string|number|boolean)(\s*\|.*)?;/g;

      let modified = false;
      content = content.replace(regex, (match, p1, p2, p3) => {
        modified = true;
        let typeStr = 'String';
        if (p3 === 'number') typeStr = 'Number';
        if (p3 === 'boolean') typeStr = 'Boolean';
        return `@ApiProperty({ type: ${typeStr} })\n  ${p2}!: ${p3};`;
      });

      const regexOptional = /(@ApiPropertyOptional\(\{\s*nullable:\s*true\s*\}\))\s+([a-zA-Z0-9_]+)[!?]?:\s*(string|number|boolean)\s*\|\s*null;/g;
      content = content.replace(regexOptional, (match, p1, p2, p3) => {
        modified = true;
        let typeStr = 'String';
        if (p3 === 'number') typeStr = 'Number';
        if (p3 === 'boolean') typeStr = 'Boolean';
        return `@ApiPropertyOptional({ type: ${typeStr}, nullable: true })\n  ${p2}!: ${p3} | null;`;
      });

      if (modified) {
        fs.writeFileSync(fullPath, content);
        console.log('Modified:', fullPath);
      }
    }
  }
}

processDir('C:/LemnixPRO/services/master-data-service/src');
processDir('C:/LemnixPRO/services/production-plan-service/src');
processDir('C:/LemnixPRO/services/optimization-orchestrator-service/src');
processDir('C:/LemnixPRO/services/identity-service/src');