/*
*   This file is part of the Perspectives Firefox Client
*
*   Copyright (C) 2011 Dan Wendlandt
*
*   This program is free software: you can redistribute it and/or modify
*   it under the terms of the GNU General Public License as published by
*   the Free Software Foundation, version 3 of the License.
*
*   This program is distributed in the hope that it will be useful,
*   but WITHOUT ANY WARRANTY; without even the implied warranty of
*   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
*   GNU General Public License for more details.
*
*   You should have received a copy of the GNU General Public License
*   along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/


var Pers_about = {

	// in Fx 4.0 and up the call to get the version number happens asynchronously,
	// so contain the update in a function we can use as the callback
	set_version_number: function(addon) {
		if (addon != null) {
			document.getElementById("perspectives-version-number").value = addon.version;
		}
	},

	load_about_dialog: function() {
		try {
			var version = "?";

			try {
				// Firefox 4 and later; Mozilla 2 and later
				Components.utils.import("resource://gre/modules/AddonManager.jsm");
				AddonManager.getAddonByID(Perspectives.MY_ID, Pers_about.set_version_number);
			}
			catch (ex) {
				Pers_debug.d_print("error", "Error getting version number? Or old version of firefox. '" + ex + "'");
				// Firefox 3.6 and before; Mozilla 1.9.2 and before
				var em = Components.classes["@mozilla.org/extensions/manager;1"]
						 .getService(Components.interfaces.nsIExtensionManager);
				version = em.getItemForID("perspectives@cmu.edu");
				document.getElementById("perspectives-version-number").value = version;
			}

			var contributors = Pers_util.readFileFromURI("chrome://perspectives/content/credits/contributors.txt");
			var translators  = Pers_util.readFileFromURI("chrome://perspectives/content/credits/translators.txt");

			document.getElementById("contributors-list").value = contributors;
			document.getElementById("translators-list").value = translators;
		} catch(e) {
			if(Perspectives.strbundle == null) {
				Perspectives.strbundle = document.getElementById("notary_strings");
			}

			Pers_util.pers_alert(Perspectives.strbundle.
				getFormattedString("loadingCreditsError", [e]));
		}
	}
}
