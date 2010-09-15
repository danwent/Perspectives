var whitelist = (function () {

    var whitelist = eval(Pers_util.readLocalFile("whitelist.json"));
          
    return { 
        onWhitelist : function (host) {
            var i = 0; 

            for (i = 0; i < whitelist.length; i += 1) {

                if (whitelist[i] === "") {
                    continue;
                }

                if (host.indexOf(whitelist[i]) >= 0) {
                    return true;
                }
            }
            return false;
        }
    };

}());

