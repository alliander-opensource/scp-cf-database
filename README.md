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

### batch query 
Exec a batch query
```js
const i = await DB.queryBatch('INSERT INTO "table.Example"("foo", "example") VALUES (?, ?)', [['bar', 'text'], ['bar 2', 'text 2']]);
console.log(i); // 2 // no affected rows 
```

### insert
Inserting will return the created insert
```js
const a = await DB.insert("table.Example", { foo: "bar"});
console.log(a); // { id: 1234, foo: "bar"}
```

### batch insert
A batch insert will return the no of affected rows
```js
const i = await DB.insertBatch(
	"table.Example", 
	[
		{ "foo": "bar", "example": "text" },
		{ "foo": "bar 2", "example": "text 2" }
	]
);
console.log(i); // 2 // no affected rows 
```

### update
UPDATE "table.Example" set "foo" = 'bar', "example" = 'text' WHERE "id" = 1
```js
await DB.update(
	"table.Example", //tabel
	{ foo: "bar", example: "text"}, // data
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
