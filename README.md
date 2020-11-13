# scp-cf-database


This class simplefies the use of working with the @sap/hana-client
- The connection will be created automatically, no need to set it up manually.
- All queries will be escaped automatically
- See the examples below and checkout the example/example-testrun.js file


### Require in JS
```js
const DB = require("scp-cf-database");
```


### query
Exec a query
```js
const a = await DB.query(`SELECT * FROM "table.Example" WHERE "foo" = ?`, ["bar"]);
```

### insert
Inserting will give back the created insert
```js
const a = await DB.insert("table.Example", { foo: "bar"});
console.log(a); // { id: 1234, foo: "bar"}
```

### update
UPDATE "table.Example" set "foo" = 'bar', "voorbeeld" = 'tekst' WHERE "id" = 1
```js
await DB.update(
	"table.Example", //tabel
	{ foo: "bar", voorbeeld: "tekst"}, // data
	`"id" = ?`, //filter
	[1] // filter waarden
);
```

### delete
DELETE FROM "table.Example" WHERE "id" = '1'
```js
await DB.delete("table.Example",	`"id" = ?`, [1]);
```

### select
```js
await DB.select("table.Example", "*", `"foo" = ?`, ["bar"]);
```

### callProcedure
```js
const aResult = await DB.callProcedure(
	"createPerson", // Procedure naam
	{ IM_FIRSTNAME: "Barry", IM_LASTNAME: "Dam" }, // Importing paams
	["EX_FULLNAME"] // Exporting params
);
console.log(aResult.EX_FULLNAME);
```

### callFunction
```js
await DB.callFunction("functionname", mImporting);
```
