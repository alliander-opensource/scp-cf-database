/* eslint-env es8 */
/* eslint no-console: 0*/
"use strict";
/****************
 * Database class die eenvoudig in alle andere node modules gebruikt kan worden.
 * - De connectie wordt automatisch gelegd in de constructor dus daar hoef je niet meer naar te kijken
 * - Alle queries worden automatisch escaped
 * 
 * @class
 * @requires @sap/xsenv
 * @requires @sap/hana-client
 * @author Barry Dam
 * @version	1.0.4
 */

const 
	xsenv					= require('@sap/xsenv'),
	hanaClient				= require('@sap/hana-client'),
	{ createProcStatement } = require('@sap/hana-client/extension/Stream'),
	{ promisify }			= require("util");
	
const _private = {
	weakmap : new WeakMap(),// gebruik een WeakMap voor private data en het voorkomen van memoryleaks	
	/**
 	 * Converteren van array parameters naar statement ? ? ? 
 	 * @param {array} aParams - Query parameters (voorbeeld: ["id", "naam"])
 	 * @return {string} - voorbeeld: "?, ?"
 	 */
	prepareParamsForStatement  : (aParams) => {
		const iParamLength	= aParams.length;
		let	sParams 		= "";
		// converteren van parameters
		if (aParams && iParamLength > 0) {
			for (const i in aParams)  {
				sParams += (i !== (iParamLength-1).toString()) ? "?, ": "?";
			}
		}
		return sParams;
	},
	staticDB		: null
};

class SapCfDatabase {
	/**
 	 * Class constructor
 	 */
	constructor(mParams) {
		if (typeof mParams !== "object") { mParams = {}; }
		const mEnvOptions = xsenv.getServices({ hana: { tag: "hana" } });
		_private.weakmap.set(this, {
			connOptions: {
               serverNode			: `${mParams.host || mEnvOptions.hana.host}:${mParams.port || mEnvOptions.hana.port}`,
               uid					: mParams.user || mEnvOptions.hana.user,
               pwd					: mParams.password || mEnvOptions.hana.password,
               encrypt				: ("encrypt" in mParams) ? mParams.encrypt : true,
               sslCryptoProvider	: mParams.sslCryptoProvider || "openssl",
               sslTrustStore		: mParams.SSLCertificate || `${mEnvOptions.hana.certificate}`,
               currentschema		: mParams.schema || mEnvOptions.hana.schema
	       }
		});
	}
	
	/**
	 * Connectie object (hanaClient connection)
	 * De connect functie connecteerd naar de connectie opties die zijn opgegeven bij het aanroepen van de class
	 * De volgende functies worden naar een promise omgezet:
	 * - connect
	 * - exec
	 * - disconnect
	 */
	get Connection() {
		const mWM = _private.weakmap.get(this);
		if (!("connection" in mWM)) {
			const oConnection = hanaClient.createConnection();
			if (!oConnection) { throw "Fout bij het opzetten van de connectie van de Database"; }
			// connect omzetten naar promise functie en automatisch connecteren met de ingestelde connOptions
			oConnection.connect = (fnOrig => {
				return mConnectOptions => fnOrig(mConnectOptions || mWM.connOptions);
			})(oConnection.connect.bind(oConnection));
			// onderstaande functies allemaal omzetten naar een promise
			oConnection.exec			= promisify(oConnection.exec.bind(oConnection));
			oConnection.disconnect		= promisify(oConnection.disconnect.bind(oConnection));
			// procedures aanroepen
			oConnection.callProcedure	= (sQuery, mIn) => {
				return new Promise((fnResolve, fnReject) => {
					createProcStatement(oConnection, sQuery, function(err, oStmt) {
						if (err) { return fnReject(oStmt); }
						oStmt.exec(mIn, function(err, mResult) {
							if (err) { return fnReject(oStmt); }
							oStmt.drop(err => {
								if (err) { return fnReject(oStmt); }		
								fnResolve(mResult);
							});
						});
					});
				});
			}
			// resave weakmap
			mWM.connection = oConnection;
			_private.weakmap.set(this, mWM);
		}
		return mWM.connection;
	}
	
	/**
	 * @param {bool} [mOptions.autoDisconnect=true] 
	 */
	async execQuery(sQuery, aParameters, mOptions) { //es-lint-disable-line
		const mOpt	= { ...{autoDisconnect:true}, ...((typeof mOptions === "object") ? mOptions : {}) },
			mWM 	= _private.weakmap.get(this),
			that	= this;
		if (this.Connection.state() === "disconnected") {
			await this.Connection.connect();
		}
		let vResult;
		if (sQuery.toUpperCase().startsWith("CALL") && ! Array.isArray(aParameters)) {
			vResult = await this.Connection.callProcedure(sQuery, aParameters);
		} else {
			let	aParams = aParameters || [];
			if (! Array.isArray(aParams)) { aParams = [aParams]; }
			vResult = await this.Connection.exec(sQuery, aParams);
		}
		if (mOpt.autoDisconnect) { this.Connection.disconnect(); }
		return vResult;
	}
	
	
	/**
	 * Query de connectie wordt automatisch gesloten na 1/2 minuut van inactiviteit
	 */
	static async query(sStatement, aParameters) {
		if (! _private.staticDB) { 
			_private.staticDB					= new SapCfDatabase();
			_private.staticDB.runIds			= [];
			_private.staticDB.timeoutRemoveDb	= null;
			_private.staticDB.onRunDone
			const fnOnDone = sRunId => {
				_private.staticDB.runIds = _private.staticDB.runIds.filter(s => s !== sRunId); 
				if (_private.staticDB.runIds.length === 0) {
					if (_private.staticDB.timeoutRemoveDb) { clearTimeout(_private.staticDB.timeoutRemoveDb); }
					_private.staticDB.timeoutRemoveDb = setTimeout(_ => {
						_private.staticDB.Connection.disconnect();
						_private.staticDB = null;
					}, 30000); // auto kill connection na 1/2 minuut inactiviteit
				}
			};
			_private.staticDB.startRun			= async (...args) => {
				if (_private.staticDB.timeoutRemoveDb) { clearTimeout(_private.staticDB.timeoutRemoveDb); }
				const sRunId = `_${Math.random().toString(36).substr(2, 9)}`;
				_private.staticDB.runIds.push(sRunId);
				try {
					const vResult = await _private.staticDB.execQuery.apply(_private.staticDB, args);
					fnOnDone(sRunId);
					return vResult;
				} catch(e) {
					fnOnDone(sRunId);
					throw e;
				}
			}
		}
		return _private.staticDB.startRun(sStatement, aParameters, { autoDisconnect: false }); 
	}
	
	/**
	 * Function procedure aanroepen
	 * @param {string} sName - Functienaam
	 * @param {array} aParams - Functie import variabelen
	 * @return {Promise} 
	 */
	static callFunction(sName, aParams) {
		aParams = aParams || [];
		return this.query(
			`SELECT * FROM "${sName}"(${_private.prepareParamsForStatement(aParams)})`,
			aParams
		);
	}
	
	/**
	 * Prodecure aanroepen
	 * @param {string} sName					- Functienaam
	 * @param {array} mData						- Functie import variabelen
	 * @param {string|array) vExportingParams	- Exporting variablen
	 * @return {Promise} - met het resultaat zie hieronder
	 * @example waar vExportingParams een string is
	 * await callProcedure("examplePerson", { IM_FIRSTNAME: "Barry", IM_LASTNAME: "Dam" }, "EX_FULLNAME"); //result == Barry Dam } 
	 * @example waar vExportingParams een Array is > het result zal een object zijn waarbij de keys de Exporting parameters zijn
	 * await callProcedure("examplePerson", { IM_FIRSTNAME: "Barry", IM_LASTNAME: "Dam" }, ["EX_FULLNAME", "EX_AGE"])  //result == {EX_FULLNAME: "Barry Dam", EX_AGE: "31"}
	 */
	static async callProcedure(sName, mData, vExportingParams) {
		if (typeof mData !== "object") { throw "Check Funtcion importing params object not "; }
		const
			aColumns			= Object.keys(mData),
			aExportingParams	= (typeof vExportingParams === "string") ? [vExportingParams] : vExportingParams,
			sColumns			= (aColumns.length) ? `${aColumns.join(' => ?, ')} => ?` : "",
			sExporting			= (sColumns && Array.isArray(aExportingParams) && aExportingParams.length) ? " ," + aExportingParams.join(" => ?, ") + " => ?" : "",
			mResult 			= await this.query(`CALL "${sName}"(${sColumns} ${sExporting})`, mData);
		if (mResult && typeof vExportingParams === "string") { 
			return mResult[Object.keys(mResult).find(key => key.toLowerCase() === vExportingParams.toLowerCase())];
		} else if (mResult && Array.isArray(aExportingParams) && aExportingParams.length) {
			return aExportingParams.reduce((a, b) => (a[b] = mResult[Object.keys(mResult).find(key => key.toLowerCase() === b.toLowerCase())], a), {});
		} 
		return mResult;
	}
	
	/**
	 * Insert nieuwe gegevens in de DB
	 * @param {string} sTablename - Tabel naam *schema name niet verplicht
	 * @param {map} mData - data dat wordt toegevoegd aan de db { kolomNaam: "waarde", kolomNaam2: "Waarde 2" }
	 * @return {Promise} die het zojuist aangemaakte resultaat retourneert 
	 * Voorbeeld normaal
	 * await db.insert("Example", { foo : "bar" }) // { id: 123, foo: "bar"}  });
	 * resultaat { id: 123, foo : "bar" };
	 * Voorbeeld batch insert
	 * await db.insert("Example", [{ foo : "bar" }, { foo : "bar 2" }]);
	 * resultaat [{ id: 123, foo : "bar" }, { id: 124, foo : "bar 2" }];
	 */
	static insert(sTablename, vData) {
		if (Array.isArray(vData)) { // batchmode
			return Promise.all(vData.map(mData => _insertqueue.addInsert(sTablename, mData)));
		}
		return _insertqueue.addInsert(sTablename, vData);
	}
	
	/**
	 * Select
	 * @param {string}		sTablename				- Tabel naam *schame name niet verplicht
	 * @param {string}		sColumns=*				- Kolommen die geselecteerd dienen te worden
	 * @param {string}		sWhereANdOrderEtc		- Where string. note: indien je geen where nodig hebt maar wel een order doe dan '1=1 ORDERBY "Test"'
	 * @param {array}		[aEscapeWhereValues]	- ? Waarden voor de where string die moeten worden escaped
	 * @param {fnQueryCallback}	fnCallback				- callback functie 2e parameter geeft een array met resultaten terug
	 *
	 * Voorbeeld 1:
	 * database.select("Example", "*", '"id" = ? AND "foo" = \'bar\'', [1], function(error, aData) { // callback });
	 * 
	 * voorbeeld 2
	 * database.select("Example", "*", { id = 1 }, function(error, aData) { // callback });
	 * 
	 * voorbeeld 3
	 * database.select("Example", { id : 1 });
	 * 
	 * voorbeeld 3a 
	 * database.select("Example", { id : 1, foo: "bar" }); // and 
	 *
	 * voorbeeld 3b
	 * database.select("Example", { id : 1, foo: "bar" }, false); // or 
	 */
	static select(sTablename, sColumns, sWhereAndOrderEtc, aEscapeWhereValues) {
		let aValues 	= [];
		if (typeof sColumns === "object") { // voorbeeld 3
			sWhereAndOrderEtc = sColumns;
			sColumns = "*";
		}
		if (typeof sWhereAndOrderEtc === "object") { // voorbeeld 2
			aValues 			= Object.values(sWhereAndOrderEtc);
			sWhereAndOrderEtc	= `"${Object.keys(sWhereAndOrderEtc).join(`" = ? ${((!aEscapeWhereValues) ? "and" : "or")} "`)}" = ?`;
		} else if (Array.isArray(aEscapeWhereValues) && aEscapeWhereValues.length) { // voorbeeld 1
			aValues = aEscapeWhereValues;
		}
		return this.query(
			`SELECT ${sColumns || "*"} FROM "${sTablename}"${(sWhereAndOrderEtc) ?  ` WHERE ${sWhereAndOrderEtc}` : ''}`,
			aValues
		);
	}
	
	/**
	 * Update de DB
	 * @param {string}		sTablename				- Tabel naam *schema name niet verplicht
	 * @param {map} 		mData					- Data dat moet worden bijgewerkt { kolomNaam: "waarde", kolomNaam2: "Waarde 2" }
	 * @param {string}		[sWhere=""]				- Where string "id" = ? AND "foo" = 'bar' // met ? of zonder kan beide
	 * @param {array}		[aEscapeWhereValues]	- ? Waarden voor de where string die moeten worden escaped
	 * 
	 * update(sTablename, mData, sWhere, fnCallback)
	 * Kan ook zonder sWhere en aEscapeWhereValues, met callback:
	 * update(sTablename, mData, fnCallback)
	 * 
	 * Voorbeeld 1:
	 * database.update("Example", { foo : "bar" }, '"id" = ? AND "foo" = \'bars\'', [1]);
	 * 
	 * voorbeeld 2
	 * database.update("Example", { foo : "bar" }, { id = 1 });
	 */
	static update(sTablename, mData, sWhere, aEscapeWhereValues) {
		const	aColumns	= Object.keys(mData);
		let		aValues			= Object.values(mData);
		if (typeof sWhere === "object") { // Voorbeeld 2
			aValues = [...aValues, ...Object.values(sWhere)];
			sWhere	= `"${Object.keys(sWhere).join("\" = ? and \"")}" = ?`;
		} else if (Array.isArray(aEscapeWhereValues) && aEscapeWhereValues.length) { // Voorbeeld 1
			aValues = [...aValues, ...aEscapeWhereValues];
		}
		return this.query(
			`UPDATE "${sTablename}" SET "${aColumns.join('" = ?, "')}" = ? ${((sWhere) ?  ` WHERE ${sWhere}` : '' )}`,
			aValues
		);
	}
	
	/**
	* Verwijderen van gegevens
	* @param {string} 	sTablename				- Tabel naam *schema name niet verplicht
	* @param {sWhere} 	sWhere					- Where string "id" = ? AND "foo" = 'bar' // met ? of zonder kan beide
	* @param {array}		[aEscapeWhereValues]	- ? Waarden voor de where string die moeten worden escaped
	* 
	* Kan ook zonder aEscapeWhereValues
	* delete(sTablename, sWhere)
	* 
	* Voorbeeld:
	* delete("Example", '"id" = ?', [1]);
	* Voorbeeld 2:
	* delete("Example", {id : 1});
	*/
	static delete(sTablename, sWhere, aEscapeWhereValues) {
		let aValues	 = [];
		if (typeof sWhere === "object") {
			aValues = Object.values(sWhere);
			sWhere	= `"${Object.keys(sWhere).join("\" = ? and \"")}" = ?`;
		} else if (Array.isArray(aEscapeWhereValues) && aEscapeWhereValues.length) { // where velden toevoegen (if any)
			aValues = aEscapeWhereValues;
		}
		return this.query(
			`DELETE FROM "${sTablename}"` + ((sWhere) ?  " WHERE " + sWhere : "" ), // eslint-disable-line 
			aValues
		);
	}
};

/**
 * De Database.insert functie geeft als resultaat de db rij terug (met een eventuele primarykey waarde)
 * Om ervoor te zorgen dat de primarykey waarde klopt, moeten deze inserts synchroon uitgevoerd worden
 * de insertqueue zorgt dat dat gebeurd.
 */
const _insertqueue	 = {
	_queue		: {
		/*
			"tablename" : [
				{ data : {foo: "bar"}, addCallback: function },
				...
			]
		*/
	},
	_running	: [], 
	addInsert: (sTableName, mData) => {
		if (!(sTableName in _insertqueue._queue)) {
			_insertqueue._queue[sTableName] = [];
		}
		const oPromise = new Promise((fnResolve, fnReject) => {
			_insertqueue._queue[sTableName].push({
				data	: mData,
				promise	: {
					resolve	: fnResolve,
					reject	: fnReject 
				}
			});
		});
		_insertqueue.runNext(sTableName);
		return oPromise;
	},
	runNext: async (sTableName) => {
		if (_insertqueue._running.indexOf(sTableName) !== -1) { return; }
		const mNext = _insertqueue._queue[sTableName].shift();
		if (!mNext) { return; }
		_insertqueue._running.push(sTableName);
		try {
			const mResult = await _insertqueue.execute(sTableName, mNext.data);
			mNext.promise.resolve(mResult);
		} catch(o) { mNext.promise.reject(o); }
		_insertqueue._running = _insertqueue._running.filter(s => s !== sTableName);
		_insertqueue.runNext(sTableName);
	},
	execute: async (sTablename, mData, fnCallback) => {
		const aRows 	= await SapCfDatabase.query(`SELECT "COLUMN_NAME" FROM "SYS"."TABLE_COLUMNS" WHERE "TABLE_NAME" = '${sTablename}' AND "IS_NULLABLE" = 'FALSE' AND "INDEX_TYPE" = 'FULL'`),
			sPrimaryKey = (aRows && aRows.length) ? aRows[0].COLUMN_NAME : null,
			aColumns	= Object.keys(mData),
			aValues		= Object.values(mData);
		if (sPrimaryKey && sPrimaryKey in mData && mData[sPrimaryKey] === null) {
			delete mData[sPrimaryKey];
		}
		const vResult = await SapCfDatabase.query(`INSERT INTO "${sTablename}"("${aColumns.join('", "')}") VALUES (${_private.prepareParamsForStatement(aValues)})`, aValues);
		if (!sPrimaryKey) { return vResult; }
		const aResult = await SapCfDatabase.query(`SELECT * FROM "${sTablename}" ORDER BY "${sPrimaryKey}" DESC LIMIT 1`);
		return aResult ? aResult[0] : null;
	}
};

module.exports = SapCfDatabase;