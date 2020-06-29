"use strict";
const SapCfDb			= require("../lib/index"), // require("sap-cf-database");
	{serializeError }	= require('serialize-error'),
	{ format }			= require("util");
module.exports = function(oApp){ 

	const wrap = fn => (...args) => fn(...args).catch(args[2]);
	
	oApp.get("/", (oReq, oRes) => {
		oRes.send("go to /test");
	});
	
	
	
	const fnAddDBLOG = (oReq, sAction, vResult) => {
		if (!("_DBLOG" in oReq)) { oReq._DBLOG = {} }
		oReq._DBLOG[sAction] = vResult;
	}
	
	oApp.get(
		"/testall", 
		wrap(async (oReq, oRes, fnNext) => { // insert
			oReq._startTime = new Date();
			const m = await SapCfDb.insert("sapCfDatabase.address", {
				street			: "Dijkgraaf",  
				no 				: 4,
				postalCode		: "6921RL",
				city			: "Duiven"
			});
			fnAddDBLOG(oReq, "insert", m);
			fnNext();
		}),
		wrap(async (oReq, oRes, fnNext) => { // select
			const a1 = await SapCfDb.select(
				"sapCfDatabase.address",
				"*",
				'"id" = ?',
				[oReq._DBLOG.insert.id]
			);
			const a2 = await SapCfDb.select(
				"sapCfDatabase.address",
				'"street", "no", "city"',
				'"id" = ?',
				[oReq._DBLOG.insert.id]
			);
			const a3 = await SapCfDb.select(
				"sapCfDatabase.address",
				{ id: oReq._DBLOG.insert.id }
			);
			fnAddDBLOG(oReq, "read", {
				"example1": a1,
				"example2": a2,
				"example3": a3
			});
			fnNext();
		}),
		wrap(async (oReq, oRes, fnNext) => { // update
			const v1 = await SapCfDb.update(
				"sapCfDatabase.address",
				{ street: "Fotograaf" },
				'"id" = ?',
				[oReq._DBLOG.insert.id]
			);
			const v2 = await SapCfDb.update(
				"sapCfDatabase.address",
				{ street: "Fotograaf" },
				{ id: oReq._DBLOG.insert.id }
			);
			fnAddDBLOG(oReq, "update", {
				"example1": v1,
				"example2": v2
			});
			fnNext();
		}),
		wrap(async (oReq, oRes, fnNext) => { // delete
			const vResult = await SapCfDb.delete(
				"sapCfDatabase.address",
				{ id: oReq._DBLOG.insert.id }
			);
			fnAddDBLOG(oReq, "delete", vResult);
			fnNext();
		}),
		(oReq, oRes) => {
			fnAddDBLOG(oReq, "executionTime", format('%dms', new Date() - oReq._startTime));
			oRes.json(oReq._DBLOG);
		}
	);
	
	oApp.get("/testInsert", wrap(async (oReq, oRes) => {
		const aInserts = [
			{
				street			: "Dijkgraaf",  
				no 				: 4,
				postalCode		: "6921RL",
				city			: "Duiven"
			},
			{
				street			: "Dijkgraaf",  
				no 				: 123,
				postalCode		: "6921RL",
				city			: "Duiven"
			}
		];
		const aResult = await Promise.all(aInserts.map(m => SapCfDb.insert("sapCfDatabase.address", m)));
		oRes.json(aResult);
	}));
	
	oApp.get("/testInsertBatch", wrap(async (oReq, oRes) => {
		const aInserts = [
			{
				street			: "Dijkgraaf",  
				no 				: 4,
				postalCode		: "6921RL",
				city			: "Duiven"
			},
			{
				street			: "Dijkgraaf",  
				no 				: 123,
				postalCode		: "6921RL",
				city			: "Duiven"
			}
		];
		const aResult = await SapCfDb.insert("sapCfDatabase.address", aInserts);
		oRes.json(aResult);
	}));
	
	/**
	 * /read
	 */
	oApp.get("/testf", wrap(async (oReq, oRes, fnNext) => {
		const a = await SapCfDb.query('SELECT * from "sapCfDatabase.address"');
		oRes.json(a);
	}));
	
	/**
	 * Procedure
	 */
	 oApp.get("/test-procedure", wrap(async(oReq, oRes) => {
	 	const v = await SapCfDb.callProcedure("PROCEDURETEST", { ID_TEST : 1 }, ["ID_OUT","EXAMPLE"]);
	 	oRes.json(v);
	 }));
	
	
	/**
	 * Error handling
	 */
	oApp.use((oErr, oReq, oRes, fnNext) => {
		oRes.status(400).json(serializeError(oErr));
	});
	
	return  oApp;
};

