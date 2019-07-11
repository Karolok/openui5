/* global QUnit */

sap.ui.define([
	"sap/ui/thirdparty/sinon-4",
	"sap/ui/fl/write/internal/Connector"
], function(
	sinon,
	Connector
) {
	"use strict";

	var sandbox = sinon.sandbox.create();

	QUnit.module("Connector", {
		beforeEach : function() {
		},
		afterEach: function() {
			sandbox.restore();
		}
	}, function() {
		QUnit.test("writeChanges", function(assert) {
			// First implementation to check that connector was called and the default rejection took place
			var done = assert.async();

			return Connector.writeChanges("VENDOR", {}).catch(function (sErrorMessage) {
				assert.equal(sErrorMessage, "writeChanges is not implemented");
				done();
			});
		});
	});

	QUnit.done(function () {
		jQuery('#qunit-fixture').hide();
	});
});
