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

var Pers_results = {
	root_prefs : Components.classes["@mozilla.org/preferences-service;1"].
				getService(Components.interfaces.nsIPrefBranch),


	switchResultForm: function() {
		var sel = document.getElementById("info-radio").selectedIndex;
		document.getElementById("perspective-svg-box").hidden     = sel;
		document.getElementById("perspective-description").hidden = !sel;
	},

	addTimeline: function(svgString) {
		var parser = new DOMParser();
		var svgDoc = parser.parseFromString(svgString, "text/xml");
		var svg    = svgDoc.getElementsByTagName("svg")[0];
		var after  = document.getElementById("perspective-svg-box");
		after.appendChild(svg);
	},

	// returns a string that describes whether Perspectives installed a
	// security exception
	getActionStr: function(uri, ti) {
		if(Pers_results.strbundle == null) {
 			Pers_results.strbundle = document.getElementById("results_strings");
 		}

		if(uri.scheme !== "https") {
			return Pers_results.strbundle.getFormattedString("notHTTPS", [uri.scheme]);
		} else if(ti.is_override_cert && ti.already_trusted) {
			return Pers_results.strbundle.getString("previouslyInstalledCert");
		} else if(ti.already_trusted) {
			return Pers_results.strbundle.getString("browserTrusts");
		} else {
			return Pers_results.strbundle.getString("noException");
		}
	},

	load_results_dialog: function() {
		if(Pers_results.notaryStrings == null) {
 			Pers_results.notaryStrings = document.getElementById("notary_strings");
 		}

 		if(Pers_results.strbundle == null) {
 			Pers_results.strbundle = document.getElementById("results_strings");
 		}

		try {
			var info  = document.getElementById("perspective-description"        );
			var liner = document.getElementById("perspective-quorum-duration"    );
			var host  = document.getElementById("perspective-information-caption");

			var win = window.opener;
			var uri = win.gBrowser.currentURI;
			var error_text = win.Perspectives.detectInvalidURI(uri);
			if(error_text) {
				info.value = "Perspectives: " +
					Pers_results.notaryStrings.getString("invalidURI") + " (" + error_text + ")";
				return;
			}
			var ti = win.Perspectives.getCurrentTabInfo(win.gBrowser.contentWindow);
			var query_results  = ti.query_results;
			host.label = ti ? uri.host + ": " + Pers_results.getActionStr(uri, ti) : uri.host;

			if(query_results) {
				info.value  = query_results.summary;
				liner.value = query_results.tooltip;
				if(query_results.svg && query_results.svg !== "") {
					info.hidden = true;
					Pers_results.addTimeline(query_results.svg);
					var radio = document.getElementById("info-radio");
					radio.hidden=false;
					radio.selectedIndex = 0;
				}
			} else if(ti.reason_str) {
				info.value = ti.reason_str;
			}
		} catch(e) {
			Pers_debug.d_print("error", "Error loading results dialog");
			Pers_debug.d_print("error", e);
			var errmsg = "";
			if(Pers_results.strbundle != null) {
				errmsg = Pers_results.strbundle.getString("errorLoadingResultsDialog") + ": ";
			}
			Pers_util.pers_alert(errmsg + e);
		}

		return true; // FIXME: inconsistent return points
	}
};
