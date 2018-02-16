/*!
 * ${copyright}
 */
//Provides mixin sap.ui.model.odata.v4.lib._V2Requestor
sap.ui.define([
	"sap/ui/core/format/DateFormat",
	"sap/ui/model/odata/ODataUtils",
	"./_Helper",
	"./_Parser"
], function (DateFormat, ODataUtils, _Helper, _Parser) {
	"use strict";

	var // Example: "/Date(1395705600000)/", matching group: ticks in milliseconds
		rDate = /^\/Date\((\d+)\)\/$/,
		oDateFormatter = DateFormat.getDateInstance({pattern: "yyyy-MM-dd", UTC : true}),
		// Example "/Date(1420529121547+0530)/", the offset ("+0530") is optional
		// matches: 1 = ticks in milliseconds, 2 = offset sign, 3 = offset hours, 4 = offset minutes
		rDateTimeOffset = /^\/Date\((\d+)(?:([-+])(\d\d)(\d\d))?\)\/$/,
		mPattern2Formatter = {},
		oDateTimeOffsetParser =
			DateFormat.getDateTimeInstance({pattern: "yyyy-MM-dd'T'HH:mm:ss.SSSZ"}),
		rPlus = /\+/g,
		rSlash = /\//g,
		// Example: "PT11H33M55S",
		// PT followed by optional hours, optional minutes, optional seconds with optional fractions
		rTime = /^PT(?:(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(\.\d+)?S)?)$/i,
		oTimeFormatter = DateFormat.getTimeInstance({pattern: "HH:mm:ss", UTC : true});

	/**
	 * A mixin for a requestor using an OData V2 service.
	 *
	 * @alias sap.ui.model.odata.v4.lib._V2Requestor
	 * @mixin
	 */
	function _V2Requestor() {}

	/**
	 * Final (cannot be overridden) request headers for OData V2.
	 */
	_V2Requestor.prototype.mFinalHeaders = {
		"Content-Type" : "application/json;charset=UTF-8"
	};

	/**
	 * Predefined request headers in $batch parts for OData V2.
	 */
	_V2Requestor.prototype.mPredefinedPartHeaders = {
		"Accept" : "application/json"
	};

	/**
	 * Predefined request headers for all requests for OData V2.
	 */
	_V2Requestor.prototype.mPredefinedRequestHeaders = {
		"Accept" : "application/json",
		"MaxDataServiceVersion" : "2.0",
		"DataServiceVersion" : "2.0",
		"X-CSRF-Token" : "Fetch"
	};

	/**
	 * Converts an OData V2 value {@link https://tools.ietf.org/html/rfc3548#section-3} of type
	 * Edm.Binary to the corresponding OData V4 value
	 * {@link https://tools.ietf.org/html/rfc4648#section-5}.
	 *
	 * @param {string} sV2Value
	 *   The OData V2 value
	 * @returns {string}
	 *   The corresponding OData V4 value
	 */
	_V2Requestor.prototype.convertBinary = function (sV2Value) {
		return sV2Value.replace(rPlus, "-").replace(rSlash, "_");
	};

	/**
	 * Converts an OData V2 value of type Edm.DateTime with <code>sap:display-format="Date"</code>
	 * to the corresponding OData V4 Edm.Date value
	 *
	 * @param {string} sV2Value
	 *   The OData V2 value
	 * @returns {string}
	 *   The corresponding OData V4 value
	 * @throws {Error}
	 *   If the V2 value is not convertible
	 */
	_V2Requestor.prototype.convertDate = function (sV2Value) {
		var oDate,
			aMatches = rDate.exec(sV2Value);

		if (!aMatches) {
			throw new Error("Not a valid Edm.DateTime value '" + sV2Value + "'");
		}
		oDate = new Date(parseInt(aMatches[1], 10));
		if (Number(aMatches[1] % (24 * 60 * 60 * 1000)) !== 0) {
			throw new Error("Cannot convert Edm.DateTime value '" + sV2Value
				+ "' to Edm.Date because it contains a time of day");
		}
		return oDateFormatter.format(oDate);
	};

	/**
	 * Converts an OData V2 value of type Edm.DateTimeOffset or Edm.DateTime without
	 * <code>sap:display-format="Date"</code> to the corresponding OData V4 Edm.DateTimeOffset value
	 *
	 * @param {string} sV2Value
	 *   The OData V2 value
	 * @param {object} oPropertyType
	 *   The property type based on the OData V4 primitive type "Edm.DateTimeOffset". The type may
	 *   provide additional constraints like the precision
	 * @returns {string}
	 *   The corresponding OData V4 value
	 * @throws {Error}
	 *   If the V2 value is not convertible
	 */
	_V2Requestor.prototype.convertDateTimeOffset = function (sV2Value, oPropertyType) {
		var aMatches = rDateTimeOffset.exec(sV2Value),
			sOffset,
			iOffsetHours,
			iOffsetMinutes,
			iOffsetSign,
			sPattern = "yyyy-MM-dd'T'HH:mm:ss",
			iPrecision = oPropertyType.$Precision,
			iTicks;

		if (!aMatches) {
			throw new Error("Not a valid Edm.DateTimeOffset value '" + sV2Value + "'");
		}
		iTicks = parseInt(aMatches[1], 10);
		iOffsetHours = parseInt(aMatches[3], 10);
		iOffsetMinutes = parseInt(aMatches[4], 10);
		if (!aMatches[2] || iOffsetHours === 0 && iOffsetMinutes === 0) {
			sOffset = "Z";
		} else {
			iOffsetSign = aMatches[2] === "-" ? -1 : 1;
			iTicks += iOffsetSign * (iOffsetHours * 60 * 60 * 1000 + iOffsetMinutes * 60 * 1000);
			sOffset = aMatches[2] + aMatches[3] + ":"  + aMatches[4];
		}
		if (iPrecision > 0) {
			sPattern += "." + jQuery.sap.padRight("", "S", iPrecision);
		}
		if (!mPattern2Formatter[sPattern]) {
			mPattern2Formatter[sPattern] =
				DateFormat.getDateTimeInstance({pattern: sPattern,UTC : true});
		}
		return mPattern2Formatter[sPattern].format(new Date(iTicks)) + sOffset;
	};

	/**
	 * Converts an OData V2 value of type Edm.Double or Edm.Single (Edm.Float) to the corresponding
	 * OData V4 value.
	 *
	 * @param {string} sV2Value
	 *   The OData V2 value
	 * @returns {any}
	 *   The corresponding OData V4 value
	 */
	_V2Requestor.prototype.convertDoubleSingle = function (sV2Value) {
		switch (sV2Value) {
			case "NaN":
			case "INF":
			case "-INF":
				return sV2Value;
			default:
				return parseFloat(sV2Value);
		}
	};

	/**
	 * Converts the filter string literals to OData V2 syntax
	 *
	 * @param {string} sFilter The filter string
	 * @param {string} sMetaPath
	 *   The meta path corresponding to the resource path
	 * @returns {string} The filter string ready for a V2 query
	 * @throws {Error} If the filter path is invalid
	 */
	_V2Requestor.prototype.convertFilter = function (sFilter, sMetaPath) {
		var oFilterTree = _Parser.parseFilter(sFilter),
			that = this;

		/*
		 * Converts the given literal operand to V2 syntax using the type of the other operand.
		 * @param {object} oLiteral The token for the literal
		 * @param {object} oOtherOperand The token for the other operand
		 */
		function convertLiteral(oLiteral, oOtherOperand) {
			var vModelValue,
				oTypeInfo = getType(oOtherOperand);

			if (oTypeInfo.$Type !== "Edm.String") {
				vModelValue = _Helper.parseLiteral(oLiteral.value, oTypeInfo.$Type, oTypeInfo.path);
				oLiteral.value = that.formatPropertyAsLiteral(vModelValue, oTypeInfo);
			}
		}

		/*
		 * Throws an error that the conversion to V2 failed.
		 * @param {object} oNode the node at which it failed
		 * @param {string} sMessage The error message
		 */
		function error(oNode, sMessage) {
			throw new Error("Cannot convert filter to V2, " + sMessage + " at " + oNode.at + ": "
				+ sFilter);
		}

		/*
		 * Determines the type of a node.
		 * @param {object} oNode A node
		 * @returns {object} A pseudo property with path, $Type (and poss. $v2Type) or undefined if
		 *   the type cannot be determined
		 */
		function getType(oNode) {
			var oProperty;

			if (oNode.type) {
				return {
					$Type : oNode.type
				};
			}
			if (oNode.id === "PATH") {
				oProperty = that.oModelInterface.fnFetchMetadata(sMetaPath + "/" + oNode.value)
					.getResult();
				if (!oProperty) {
					throw new Error("Invalid filter path: " + oNode.value);
				}
				return {
					path : oNode.value,
					$Type : oProperty.$Type,
					$v2Type : oProperty.$v2Type
				};
			}
			// oNode must have id "FUNCTION" and type undefined here. So it must be either ceiling,
			// floor or round and the return type is determined from the first and only parameter.
			return getType(oNode.parameters[0]);
		}

		/*
		 * Visits a node in the syntax recursively.
		 * @param {object} oNode A node
		 */
		function visitNode(oNode) {
			if (oNode) {
				if (oNode.id === "VALUE" && oNode.ambiguous) {
					error(oNode, "ambiguous type for the literal");
				}
				visitNode(oNode.left);
				visitNode(oNode.right);
				if (oNode.parameters) {
					if (oNode.value === "contains") {
						oNode.value = "substringof";
						oNode.parameters.push(oNode.parameters.shift()); // swap the parameters
					}
					oNode.parameters.forEach(visitNode);
				}
				if (oNode.left && oNode.right) {
					if (oNode.left.id === "VALUE") {
						if (oNode.right.id === "VALUE") {
							error(oNode, "saw literals on both sides of '" + oNode.id + "'");
						}
						convertLiteral(oNode.left, oNode.right);
					} else if (oNode.right.id === "VALUE") {
						convertLiteral(oNode.right, oNode.left);
					}
				}
			}
		}

		visitNode(oFilterTree);
		return _Parser.buildFilterString(oFilterTree);
	};

	/**
	 * Converts an OData V2 value of type Edm.Time to the corresponding OData V4 Edm.TimeOfDay value
	 *
	 *  @param {string} sV2Value
	 *   The OData V2 value
	 * @returns {string}
	 *   The corresponding OData V4 value
	 * @throws {Error}
	 *   If the V2 value is not convertible
	 */
	_V2Requestor.prototype.convertTimeOfDay = function (sV2Value) {
		var oDate,
			aMatches = rTime.exec(sV2Value),
			iTicks;

		if (!aMatches) {
			throw new Error("Not a valid Edm.Time value '" + sV2Value + "'");
		}

		iTicks = Date.UTC(1970, 0, 1, aMatches[1] || 0, aMatches[2] || 0, aMatches[3] || 0);
		oDate = new Date(iTicks);
		return oTimeFormatter.format(oDate) + (aMatches[4] || "");
	};

	/**
	 * Converts a complex value or a collection of complex values from an OData V2 response payload
	 * to an object in OData V4 JSON format.
	 *
	 * @param {object} oObject
	 *   The object to be converted
	 * @returns {object}
	 *   The converted payload
	 * @throws {Error}
	 *   If oObject does not contain inline metadata with type information
	 */
	_V2Requestor.prototype.convertNonPrimitive = function (oObject) {
		var sPropertyName,
			oType,
			sTypeName,
			vValue,
			that = this;

		// results may be an array of entities or the property 'results' of a single request.
		if (oObject.results && !oObject.__metadata) {
			// collection of complex values, coll. of primitive values only supported since OData V3
			oObject.results.forEach(function (oItem) {
				that.convertNonPrimitive(oItem);
			});
			return oObject.results;
		}

		// complex value
		if (!oObject.__metadata || !oObject.__metadata.type) {
			throw new Error("Cannot convert structured value without type information in "
				+ "__metadata.type: " + JSON.stringify(oObject));
		}

		sTypeName = oObject.__metadata.type;
		oType = that.getTypeForName(sTypeName); // can be entity type or complex type
		delete oObject.__metadata;
		for (sPropertyName in oObject) {
			vValue = oObject[sPropertyName];
			if (vValue === null) {
				continue;
			}
			if (typeof vValue === "object") { // non-primitive property value
				if (vValue.__deferred) {
					delete oObject[sPropertyName];
				} else {
					oObject[sPropertyName] = this.convertNonPrimitive(vValue);
				}
				continue;
			}
			// primitive property value
			oObject[sPropertyName] = this.convertPrimitive(vValue, oType[sPropertyName],
				sTypeName, sPropertyName);
		}
		return oObject;
	};

	/**
	 * Computes the OData V4 primitive value for the given OData V2 primitive value and type.
	 *
	 * @param {any} vValue
	 *   The value to be converted
	 * @param {object} oPropertyType
	 *   The property type containing the OData V4 primitive type and additional type specific
	 *   information for conversion
	 * @param {string} sTypeName
	 *   The qualified name of the entity or complex type containing the property with the value to
	 *   be converted
	 * @param {string} sPropertyName
	 *   The name of the property in the entity or complex type
	 * @returns {any}
	 *   The converted value
	 * @throws {Error}
	 *   If the property type is unknown
	 */
	_V2Requestor.prototype.convertPrimitive = function (vValue, oPropertyType, sTypeName,
			sPropertyName) {
		switch (oPropertyType && oPropertyType.$Type) {
			case "Edm.Binary":
				return this.convertBinary(vValue);
			case "Edm.Date":
				return this.convertDate(vValue);
			case "Edm.DateTimeOffset":
				return this.convertDateTimeOffset(vValue, oPropertyType);
			case "Edm.Boolean":
			case "Edm.Byte":
			case "Edm.Decimal":
			case "Edm.Guid":
			case "Edm.Int16":
			case "Edm.Int32":
			case "Edm.Int64":
			case "Edm.SByte":
			case "Edm.String":
				return vValue;
			case "Edm.Double":
			case "Edm.Single":
				return this.convertDoubleSingle(vValue);
			case "Edm.TimeOfDay":
				return this.convertTimeOfDay(vValue);
			default:
				throw new Error("Type '" + (oPropertyType && oPropertyType.$Type)
					+ "' of property '" + sPropertyName + "' in type '" + sTypeName
					+ "' is unknown; cannot convert value: " + vValue);
		}
	};

	/**
	 * Checks whether the "DataServiceVersion" header is not set or has the value "1.0" or "2.0"
	 * otherwise an error is thrown.
	 *
	 * @param {function} fnGetHeader
	 *   A callback function to get a header attribute for a given header name with case-insensitive
	 *   search by header name
	 * @param {string} sResourcePath
	 *   The resource path of the request
	 * @param {boolean} [bVersionOptional=false]
	 *   Indicates whether the OData service version is optional, which is the case for all OData V2
	 *   responses. So this parameter is ignored.
	 * @throws {Error} If the "DataServiceVersion" header is neither "1.0" nor "2.0" nor not set at
	 *   all
	 */
	_V2Requestor.prototype.doCheckVersionHeader = function (fnGetHeader, sResourcePath,
			bVersionOptional) {
		var sDataServiceVersion = fnGetHeader("DataServiceVersion"),
			vODataVersion = !sDataServiceVersion && fnGetHeader("OData-Version");

		if (vODataVersion) {
			throw new Error("Expected 'DataServiceVersion' header with value '1.0' or '2.0' but "
				+ "received 'OData-Version' header with value '" + vODataVersion
				+ "' in response for " + this.sServiceUrl + sResourcePath);
		}
		if (sDataServiceVersion === "1.0" || sDataServiceVersion === "2.0"
				|| !sDataServiceVersion) {
			return;
		}
		throw new Error("Expected 'DataServiceVersion' header with value '1.0' or '2.0' but "
			+ "received value '" + sDataServiceVersion + "' in response for " + this.sServiceUrl
			+ sResourcePath);
	};

	/**
	 * Converts an OData V2 response payload to an OData V4 response payload.
	 *
	 * @param {object} oResponsePayload
	 *   The OData V2 response payload
	 * @returns {object}
	 *   The OData V4 response payload
	 * @throws {Error}
	 *   If the OData V2 response payload cannot be converted
	 */
	_V2Requestor.prototype.doConvertResponse = function (oResponsePayload) {
		var oCandidate, bIsArray, aKeys, oPayload;

		oResponsePayload = oResponsePayload.d;
		// 'results' may be an array of entities in case of a collection request or the property
		// 'results' of a single request.
		bIsArray = oResponsePayload.results && !oResponsePayload.__metadata;
		if (!bIsArray && !oResponsePayload.__metadata) {
			aKeys = Object.keys(oResponsePayload);
			oCandidate = oResponsePayload[aKeys[0]];
			if (aKeys.length === 1 && oCandidate && oCandidate.__metadata) {
				// drill down into candidate for "entityComplexProperty"
				oResponsePayload = oCandidate;
			}
		}

		oPayload = this.convertNonPrimitive(oResponsePayload);

		if (bIsArray) {
			oPayload = {value : oPayload};
			if (oResponsePayload.__count) {
				oPayload["@odata.count"] = oResponsePayload.__count;
			}
			if (oResponsePayload.__next) {
				oPayload["@odata.nextLink"] = oResponsePayload.__next;
			}
		}
		return oPayload;
	};

	/**
	 * Converts the supported V4 OData system query options to the corresponding V2 OData system
	 * query options.
	 *
	 * @param {string} sMetaPath
	 *   The meta path corresponding to the resource path
	 * @param {object} mQueryOptions The query options
	 * @param {function(string,any)} fnResultHandler
	 *   The function to process the converted options getting the name and the value
	 * @param {boolean} [bDropSystemQueryOptions=false]
	 *   Whether all system query options are dropped (useful for non-GET requests)
	 * @param {boolean} [bSortExpandSelect=false]
	 *   Whether the paths in $expand and $select shall be sorted in the query string
	 * @throws {Error}
	 *   If a system query option other than $expand and $select is used or if any $expand value is
	 *   not an object
	 */
	_V2Requestor.prototype.doConvertSystemQueryOptions = function (sMetaPath, mQueryOptions,
			fnResultHandler, bDropSystemQueryOptions, bSortExpandSelect) {
		var aSelects = [],
			that = this;

		/**
		 * Converts the V4 $expand options to flat V2 $expand and $select structure.
		 *
		 * @param {string[]} aExpands The resulting list of $expand paths
		 * @param {object} mExpandItem The current $expand item to be processed
		 * @param {string} sPathPrefix The path prefix used to compute the absolute path
		 * @returns {string[]} The list of $expand paths
		 * @throws {Error}
		 *   If a system query option other than $expand and $select is used or if any $expand value
		 *   is not an object
		 */
		function convertExpand(aExpands, mExpandItem, sPathPrefix) {
			if (!mExpandItem || typeof mExpandItem !== "object") {
				throw new Error("$expand must be a valid object");
			}

			Object.keys(mExpandItem).forEach(function (sExpandPath) {
				var sAbsoluteExpandPath = _Helper.buildPath(sPathPrefix, sExpandPath),
					vExpandOptions = mExpandItem[sExpandPath], // an object or true
					vSelectsInExpand;

				aExpands.push(sAbsoluteExpandPath);

				if (typeof vExpandOptions === "object") {
					Object.keys(vExpandOptions).forEach(function (sQueryOption) {
						switch (sQueryOption) {
							case "$expand":
								// process nested expands
								convertExpand(aExpands, vExpandOptions.$expand,
									sAbsoluteExpandPath);
								break;
							case "$select":
								// process nested selects
								vSelectsInExpand = vExpandOptions.$select;
								if (!Array.isArray(vSelectsInExpand)) {
									vSelectsInExpand = vSelectsInExpand.split(",");
								}
								vSelectsInExpand.forEach(function (sSelect) {
									aSelects.push(_Helper.buildPath(sAbsoluteExpandPath, sSelect));
								});
								break;
							default:
								throw new Error("Unsupported query option in $expand: "
									+ sQueryOption);
						}
					});
				}
				if (!vExpandOptions.$select) {
					aSelects.push(sAbsoluteExpandPath + "/*");
				}
			});
			return aExpands;
		}

		Object.keys(mQueryOptions).forEach(function (sName) {
			var bIsSystemQueryOption = sName[0] === '$',
				vValue = mQueryOptions[sName];

			if (bDropSystemQueryOptions && bIsSystemQueryOption) {
				return;
			}

			switch (sName) {
				case "$count":
					sName = "$inlinecount";
					vValue = vValue ? "allpages" : "none";
					break;
				case "$expand":
					vValue = convertExpand([], vValue, "");
					vValue = (bSortExpandSelect ? vValue.sort() : vValue).join(",");
					break;
				case "$orderby":
					break;
				case "$select":
					aSelects.push.apply(aSelects,
						Array.isArray(vValue) ? vValue : vValue.split(","));
					return; // don't call fnResultHandler; this is done later
				case "$filter":
					vValue = that.convertFilter(vValue, sMetaPath);
					break;
				default:
					if (bIsSystemQueryOption) {
						throw new Error("Unsupported system query option: " + sName);
					}
			}
			fnResultHandler(sName, vValue);
		});

		// only if all (nested) query options are processed, all selects are known
		if (aSelects.length > 0) {
			if (!mQueryOptions.$select) {
				aSelects.push("*");
			}
			fnResultHandler("$select", (bSortExpandSelect ? aSelects.sort() : aSelects).join(","));
		}
	};

	/**
	 * Formats a given internal value into a literal suitable for usage in OData V2 URLs. See
	 * http://www.odata.org/documentation/odata-version-2-0/overview#AbstractTypeSystem.
	 *
	 * @param {*} vValue
	 *   The value
	 * @param {object} oProperty
	 *   The OData property
	 * @returns {string}
	 *   The literal for the URL
	 * @throws {Error}
	 *   When called for an unsupported type
	 * @see sap.ui.model.odata.ODataUtils#formatValue
	 */
	_V2Requestor.prototype.formatPropertyAsLiteral = function (vValue, oProperty) {

		// Parse using the given formatter and check that the result is valid
		function parseAndCheck(oDateFormat, sValue) {
			var oDate = oDateFormat.parse(sValue);
			if (!oDate) {
				throw new Error("Not a valid " + oProperty.$Type + " value: " + sValue);
			}
			return oDate;
		}

		if (vValue === null) {
			return "null";
		}

		// Convert the value to V2 model format
		switch (oProperty.$Type) {
			case "Edm.Boolean":
			case "Edm.Byte":
			case "Edm.Decimal":
			case "Edm.Double":
			case "Edm.Guid":
			case "Edm.Int16":
			case "Edm.Int32":
			case "Edm.Int64":
			case "Edm.SByte":
			case "Edm.Single":
			case "Edm.String":
				break;
			case "Edm.Date":
				vValue = parseAndCheck(oDateFormatter, vValue);
				break;
			case "Edm.DateTimeOffset":
				vValue = parseAndCheck(oDateTimeOffsetParser, vValue);
				break;
			case "Edm.TimeOfDay":
				vValue = {
					__edmType : "Edm.Time",
					ms : parseAndCheck(oTimeFormatter, vValue).getTime()
				};
				break;
			default:
				throw new Error("Type '" + oProperty.$Type
					+ "' in the key predicate is not supported");
		}
		// Use the V2 function to format the value for a literal
		return ODataUtils.formatValue(vValue, oProperty.$v2Type || oProperty.$Type);
	};

	/**
	 * Returns the resource path relative to the service URL and adds query options in case of
	 * a bound operation (V2: "sap:action-for"). Operation parameters are moved to query options,
	 * undeclared parameters are removed. In case of a non-POST action, the V2 HTTP method is
	 * tunneled as a parameter "X-HTTP-Method".
	 *
	 * @param {string} sPath
	 *   The absolute binding path to the bound operation or operation import, e.g.
	 *   "/Entity('0815')/bound.Operation(...)" or "/OperationImport(...)"
	 * @param {object} oOperationMetadata
	 *   The operation's metadata
	 * @param {object} mParameters
	 *   A copy of the map of key-values pairs representing the operation's actual parameters
	 * @param {object} mQueryOptions
	 *   A copy of the map of key-value pairs representing the query string, the value in this pair
	 *   has to be a string or an array of strings
	 * @param {function|object} [vEntity]
	 *   The existing entity data (or a function which may be called to access it) in case of a
	 *   bound operation (V2: "sap:action-for")
	 * @returns {string}
	 *   The new path without leading slash and ellipsis
	 * @throws {Error}
	 *   If a collection-valued operation parameter is encountered
	 *
	 * @private
	 */
	_V2Requestor.prototype.getPathAndAddQueryOptions = function (sPath, oOperationMetadata,
		mParameters, mQueryOptions, vEntity) {
		var sName,
			oTypeMetadata,
			that = this;

		sPath = sPath.slice(1, -5);

		if (oOperationMetadata.$IsBound) {
			sPath = sPath.slice(sPath.lastIndexOf(".") + 1);
			if (typeof vEntity === "function") {
				vEntity = vEntity();
			}
			// Note: $metadata is already available because oOperationMetadata has been read!
			oTypeMetadata = this.getTypeForName(oOperationMetadata.$Parameter[0].$Type);
			oTypeMetadata.$Key.forEach(function (sName) {
				mQueryOptions[sName]
					= that.formatPropertyAsLiteral(vEntity[sName], oTypeMetadata[sName]);
			});
		}

		if (oOperationMetadata.$Parameter) {
			oOperationMetadata.$Parameter.forEach(function (oParameter) {
				sName = oParameter.$Name;
				if (sName in mParameters) {
					if (oParameter.$IsCollection) {
						throw new Error("Unsupported collection-valued parameter: " + sName);
					}
					mQueryOptions[sName]
						= that.formatPropertyAsLiteral(mParameters[sName], oParameter);
					delete mParameters[sName];
				}
			});
		}
		for (sName in mParameters) {
			delete mParameters[sName];
		}
		if (oOperationMetadata.$v2HttpMethod) {
			mParameters["X-HTTP-Method"] = oOperationMetadata.$v2HttpMethod;
		}

		return sPath;
	};

	/**
	 * Returns the type with the given qualified name.
	 *
	 * @param {string} sName The qualified type name
	 * @returns {object} The type
	 */
	_V2Requestor.prototype.getTypeForName = function (sName) {
		var oType;

		this.mTypesByName = this.mTypesByName || {};
		oType = this.mTypesByName[sName];
		if (!oType) {
			oType = this.mTypesByName[sName] =
				this.oModelInterface.fnFetchMetadata("/" + sName).getResult();
		}
		return oType;
	};

	/**
	 * Tells whether an empty object in the request body is optional for (parameterless) actions.
	 * For OData V2, this is true in the sense that the request body should be empty and parameters
	 * are all part of the resource path.
	 *
	 * @returns {boolean} <code>true</code>
	 *
	 * @private
	 */
	_V2Requestor.prototype.isActionBodyOptional = function () {
		return true;
	};

	/**
	 * Tells whether change sets are optional. For OData V2, this is false, i.e. even single change
	 * requests must be wrapped within a change set.
	 *
	 * @returns {boolean} <code>false</code>
	 *
	 * @private
	 */
	_V2Requestor.prototype.isChangeSetOptional = function () {
		return false;
	};

	/**
	 * Returns a sync promise that is resolved when the requestor is ready to be used. Waits for the
	 * metadata to be available.
	 *
	 * @returns {sap.ui.base.SyncPromise} A sync promise that is resolved with no result when the
	 * metadata is available
	 */
	_V2Requestor.prototype.ready = function () {
		return this.oModelInterface.fnFetchEntityContainer().then(function () {});
	};

	return function (oObject) {
		jQuery.extend(oObject, _V2Requestor.prototype);
	};
}, /* bExport= */ false);