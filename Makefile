all:
	rm -rf build/
	mkdir build
	cp -r plugin/* build/
	cp http_notary_list.txt build/
	sh -c "cd build/ && zip -r ../Perspectives.xpi * -x *\.svn*" 
	rm -rf build	

