
var Pers_report = { 


/*
   cert.commonName
   cert.organization
   cert.organizationalUnit
   cert.serialNumber
   cert.sha1Fingerprint
   cert.md5Fingerprint
   cert.validity.notBeforeLocalDay
   cert.validity.notAfterLocalDay
   cert.issuerCommonName
   cert.issuerOrganization
   cert.issuerOrganizationUnit
*/


     REPORT_URI : "https://www.networknotary.org/report.php", 

     // An attack may have happened due to an DNS attack.  Thus, it is 
     // useful to gather this data.  
     get_ips : function(hostname) {
        var cls = Components.classes['@mozilla.org/network/dns-service;1'];
        var iface = Components.interfaces.nsIDNSService;
        var dns = cls.getService(iface);
        var ips = Array();
        var nsrecord = dns.resolve(hostname, true);

        while (nsrecord && nsrecord.hasMore()) {
            ips[ips.length] = nsrecord.getNextAddrAsString();
        }

        return ips;
    },  
 
    get_ip_str : function(hostname) {
        var ips    = this.get_ips(hostname);
        var ip_str = "";

        if (ips.length <= 0 ) {
            return ip_str;
        }

        ip_str = ips[0];

        if (ips.length == 1) {
            return ip_str;
        }

        for (var i = 1; i < ips.length; i++) {
            ip_str= ip_str + "," + ips[i];
        }

        return ip_str;
    }, 

    get_report_json : function() {
	var b = window.opener.gBrowser; 
	var cert = window.arguments[0];  
	var host = b.currentURI.host;	
        report_data      = {
		"host" : host,  
		"cert" :  { 
        		"commanName" 		 : cert.commonName, 
		        "organization"           : cert.organization, 
		        "organizationalUnit"     : cert.organizationalUnit,
		        "serialNumber"           : cert.serialNumber,
		        "sha1Fingerprint"        : cert.sha1Fingerprint,
		        "md5Fingerprint"         : cert.md5Fingerprint,
		        "notBeforeLocalDay"      : cert.validity.notBeforeLocalDay,
		        "notAfterLocalDay"       : cert.validity.notAfterLocalDay,
		        "issuerCommonName"       : cert.issuerCommonName,
		        "issuerOrganization"     : cert.issuerOrganization,
		        "issuerOrganizationUnit" : cert.issuerOrganizationUnit,
		}, 
		"ips" : this.get_ip_str(host) 
	} 
	return report_data; 
    }, 

    submit_data : function() {
	try { 
		var obj = this.get_report_json(); 
        	var report_json_str = JSON.stringify(obj);

		window.close(); 

		// no feedback if request fails. 
        	var req = new XMLHttpRequest();
        	req.open("POST", this.REPORT_URI + "?report=" + report_json_str);
        	req.send(null);
		alert("done sending data"); 
	} catch(e) { 
		alert("Error submitting report: " + e); 
	} 
    }, 

    // note: this function is called in the scope of the main window, which is able to grab the cert
    report_attack : function() {
	var cert = Perspectives.getCertificate(window.gBrowser); 
        window.openDialog("chrome://perspectives/content/report.xul", "", "", cert).focus();
    }, 

    // this function is called by the 'report attack' window once it is open. 
    load_report_dialog : function() { 
/*
        function dgid(a) {
            return document.getElementById(a);
        }

        var attack_data                      = window.arguments[0];
        var cert                             = attack_data.cert;
        var uri                              = attack_data.uri;
        dgid("commonName").value             = cert.commonName;
        dgid("organization").value           = cert.organization;
        dgid("organizationalUnit").value     = cert.organizationalUnit;
        dgid("serialNumber").value           = cert.serialNumber;
        dgid("sha1Fingerprint").value        = cert.sha1Fingerprint;
        dgid("md5Fingerprint").value         = cert.md5Fingerprint;
        dgid("notBeforeLocalDay").value      = cert.validity.notBeforeLocalDay;
        dgid("notAfterLocalDay").value       = cert.validity.notAfterLocalDay;
        dgid("issuerCommonName").value       = cert.issuerCommonName;
        dgid("issuerOrganization").value     = cert.issuerOrganization;
        dgid("issuerOrganizationUnit").value = cert.issuerOrganizationUnit;
        dgid("uri").value                    = attack_data.uri;
        dgid("host").value                   = attack_data.host;
        dgid("ips").value                    = attack_data.ips;
	*/ 
    }
}

