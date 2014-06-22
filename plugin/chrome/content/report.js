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


var Pers_report = {

     REPORT_URI : "https://www.networknotary.org/report.php",

     // An attack may have happened due to an DNS attack.  Thus, it is
     // useful to gather this data.
     get_ips : function(hostname) {
        var cls = Components.classes['@mozilla.org/network/dns-service;1'];
        var iface = Components.interfaces.nsIDNSService;
        var dns = cls.getService(iface);
        var ips = [];
        var nsrecord = dns.resolve(hostname, true);

        while(nsrecord && nsrecord.hasMore()) {
            ips[ips.length] = nsrecord.getNextAddrAsString();
        }

        return ips;
    },

    get_ip_str : function(hostname) {
        var ips    = this.get_ips(hostname);
        var ip_str = "";

        if(ips.length <= 0 ) {
            return ip_str;
        }

        ip_str = ips[0];

        if(ips.length === 1) {
            return ip_str;
        }

        for(var i = 1; i < ips.length; i++) {
            ip_str= ip_str + "," + ips[i];
        }

        return ip_str;
    },

    get_report_json : function() {
		var b = window.opener.gBrowser;
		var cert = window.arguments[0];
		var res  = window.arguments[1];
		var host = b.currentURI.host;
		var additional_text =  document.getElementById("additional-info").value;
		var email_address   =  document.getElementById("email-address").value;
		var full_report     = !document.getElementById("full-radio").selectedIndex;
		var ip_str = "";
		if(full_report) {
			ip_str = this.get_ip_str(host);
		}
		return {
			"host" : host,
			"port" : b.currentURI.port,
			"record_ip" : full_report,
			"cert" :  {
				"commonName" 			 : cert.commonName,
				"organization"           : cert.organization,
				"organizationalUnit"     : cert.organizationalUnit,
				"serialNumber"           : cert.serialNumber,
				"sha1Fingerprint"        : cert.sha1Fingerprint,
				"md5Fingerprint"         : cert.md5Fingerprint,
				"notBeforeLocalDay"      : cert.validity.notBeforeLocalDay,
				"notAfterLocalDay"       : cert.validity.notAfterLocalDay,
				"issuerCommonName"       : cert.issuerCommonName,
				"issuerOrganization"     : cert.issuerOrganization,
				"issuerOrganizationUnit" : cert.issuerOrganizationUnit
			},
			"ips" : ip_str,
			"results" : {
				"cur_consistent"       : res.cur_consistent,
				"inconsistent_results" : res.inconsistent_results,
				"weakly_seen"          : res.weakly_seen,
				"duration"             : res.duration,
				"server_result_list"   : res.server_result_list,
				"created"              : res.created
			},
			"addition_text" : additional_text,
			"email_address" : email_address
		};
    },

	submit_data : function() {
		// don't close the window here through code -
		// let the user decide when to close it so they can read any error messages.
		// since the user won't be able to interact with this form while the report is being sent,
		// temporarily disable the buttons until we're done.
		var orig_label = document.getElementById("SubmitReport").label; //TODO: test with other localizations

		if(Pers_report.strbundle == null) {
			Pers_report.strbundle = document.getElementById("report_strings");
		}
		try {
			document.getElementById("SubmitReport").disabled = true;
			document.getElementById("Close").disabled = true;
			document.getElementById("SubmitReport").label =
				Pers_report.strbundle.getString("SubmittingReport");

			var report_json_str = JSON.stringify(this.get_report_json());
			var full_report = !document.getElementById("full-radio").selectedIndex;

			// no feedback if request fails.
			var req = new XMLHttpRequest();
			// synchronous request
			req.open("POST", this.REPORT_URI + "?record_ip=" + full_report, false);
			req.send(report_json_str);
			if(req.status !== 200) {
				Pers_util.pers_alert(
					Pers_report.strbundle.getString("FailedToReport") +
					" '" + this.REPORT_URI + "'. " +
					Pers_report.strbundle.getString("ErrorCode") +
					"  = " + req.status);
			}
		} catch(e) {
			Pers_util.pers_alert(Pers_report.strbundle.getString("ErrorSubmittingReport") +
				": " + e);
		} finally {
			document.getElementById("SubmitReport").label = orig_label;
			document.getElementById("SubmitReport").disabled = false;
			document.getElementById("Close").disabled = false;
		}
	},

    // note: this function is called in the scope of the main window, which is able to grab the cert.
    // that also means we use Perspectives.strbundle rather than Pers_report.strbundle.
    report_attack : function() {
		if(Perspectives.strbundle == null) {
			Perspectives.strbundle = document.getElementById("notary_strings");
		}
		try {
			var uri = window.gBrowser.currentURI;
			var error_text = Perspectives.detectInvalidURI(uri);
			if(error_text) {
				Pers_util.pers_alert(Perspectives.strbundle.getString("invalidURI")
					+ " (" + error_text + ")");
				return;
			}

			var ti = Perspectives.getCurrentTabInfo(window.gBrowser.contentWindow);

			var cert = Perspectives.getCertificate(window.gBrowser);
			if(!cert) {
				// FIXME - is this check correct?
				Pers_util.pers_alert(Perspectives.strbundle.getFormattedString("notEncryptedNoReport",
					[uri.host]));
				return;
			}

			var cached_results = ti.query_results;
			if(!cached_results) {
				throw(Perspectives.strbundle.getString("noResultsNoReport"));
			}

			window.openDialog("chrome://perspectives/content/report.xul", "", "centerscreen, resizable",
				cert, cached_results).focus();
		} catch(e) {
			var text = "";
			if(Perspectives.strbundle != null) {
				text = Perspectives.strbundle.getString("unableToMakeReport") + " - ";
			}
			Pers_util.pers_alert(text + e);
		}
    },

    // this function is called by the 'report attack' window once it is opened
    // or when one of the controls was toggled.
    refresh_report_dialog : function() {
		if(Pers_report.strbundle == null) {
			Pers_report.strbundle = document.getElementById("report_strings");
		}
		try {
			var show_full = document.getElementById("show_full").checked;
			document.getElementById("full-text").hidden = !show_full;
			document.getElementById("full-text-label").hidden = !show_full;
			var label = Pers_report.strbundle.getString("FullReportText");
			if(document.getElementById("full-radio").selectedIndex) {
				label = Pers_report.strbundle.getString("PrivateReportText");
			}
			if(show_full) {
				document.getElementById("full-text-label").value = label;
				document.getElementById("full-text"      ).value = Pers_util.pretty_print_json(this.get_report_json());
			}
		} catch(e) {
			var text = "";
			if(Perspectives.strbundle != null) {
				text = Perspectives.strbundle.getString("unableToMakeReport") + " - ";
			}
			Pers_util.pers_alert(text + e);
		}
    }
};

