var HEARTRATE_SERVICE = '180D';
var HEARTRATE_CHARACTERISTIC = '2A37';

// i must be < 256
function asHexString(i) {
    var hex;

    hex = i.toString(16);

    // zero padding
    if (hex.length === 1) {
        hex = "0" + hex;
    }

    return "0x" + hex;
}

function parseAdvertisingData(buffer) {
    var length, type, data, i = 0, advertisementData = {};
    var bytes = new Uint8Array(buffer);

    while (length !== 0) {

        length = bytes[i] & 0xFF;
        i++;

        // decode type constants from https://www.bluetooth.org/en-us/specification/assigned-numbers/generic-access-profile
        type = bytes[i] & 0xFF;
        i++;

        data = bytes.slice(i, i + length - 1).buffer; // length includes type byte, but not length byte
        i += length - 2;  // move to end of data
        i++;

        advertisementData[asHexString(type)] = data;
    }

    return advertisementData;
}


var app = {
    initialize: function() {
        this.bindEvents();
        this.showMainPage();
    },
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
        document.addEventListener('backbutton', this.onBackButton, false);
        deviceList.addEventListener('click', this.connect, false);
        refreshButton.addEventListener('click', this.refreshDeviceList, false);
        disconnectButton.addEventListener('click', this.disconnect, false);
    },
    onDeviceReady: function() {
        FastClick.attach(document.body); // https://github.com/ftlabs/fastclick
        app.refreshDeviceList();
    },
    refreshDeviceList: function() {
        deviceList.innerHTML = ''; // empty the list
        ble.scan([HEARTRATE_SERVICE], 10, app.onDiscoverDevice, app.onError);
        refreshButton.hidden = true;
        scanStatusDiv.innerHTML = "Scanning...";
        setTimeout(function() {
            refreshButton.hidden = false;
            scanStatusDiv.innerHTML = "";
        },10000);
    },
    onDiscoverDevice: function(device) {
        var HEARTRATE = app.parseHEARTRATE(device);

        var listItem = document.querySelector('[data-device-id="' + device.id + '"]');
        if (!listItem) { // need to create list item
            listItem = document.createElement('li');
            deviceList.appendChild(listItem);
        }
        listItem.innerHTML = device.name + '<br/>' +
            device.id + '<br/>' +
            'RSSI: ' + device.rssi +
            HEARTRATE;
        listItem.dataset.deviceId = device.id;
    },
    parseHEARTRATE: function(device) {
        // get the HEARTRATE from service data in the advertising packet
//        var bpm, flags, serviceData;
        var celsius, fahrenheit, serviceData;
        var HEARTRATE = '';

        if (cordova.platformId === 'ios') {
            serviceData = device.advertising.kCBAdvDataServiceData;
            console.log("Advertising service data: "+JSON.stringify(serviceData));
            if (serviceData && serviceData["180D"]) {
                celsius = new Uint16Array(serviceData["180D"])[0];
                console.log("serviceData.180D = "+JSON.stringify(celsius));
            }
        } else { // android
            var SERVICE_DATA_KEY = '0x16';
            var advertisingData = parseAdvertisingData(device.advertising);
            serviceData = advertisingData[SERVICE_DATA_KEY];
            if (serviceData) {
                // first 2 bytes are the 16 bit UUID
                var uuidBytes = new Uint16Array(serviceData.slice(0,2));
                var uuid = uuidBytes[0].toString(16); // hex string
                console.log("Found service data for " + uuid);
                // remaining bytes are the service data, expecting 32bit floating point number
                var data = new Uint16Array(serviceData.slice(2));
                celsius = data[0];
            }
        }

        if (celsius) {
            fahrenheit = celsius >>> 8; // unsigned bitwise right shift 
            HEARTRATE = '<br/>Heartrate: ' + fahrenheit.toFixed(1) + ' BPM';
        }
        return HEARTRATE;
    },
    connect: function(e) {
        var deviceId = e.target.dataset.deviceId;
        ble.connect(deviceId, app.onConnect, app.onError);
    },
    onConnect: function(peripheral) {
        app.peripheral = peripheral;
        app.showDetailPage();

        var failure = function(reason) {
            navigator.notification.alert(reason, null, "HEARTRATE Error");
        };

        // subscribe to be notified when the HEARTRATE changes
        ble.startNotification(
            peripheral.id,
            HEARTRATE_SERVICE,
            HEARTRATE_CHARACTERISTIC,
            app.onHEARTRATEChange,
            failure
        );

        // read the initial value
        ble.read(
            peripheral.id,
            HEARTRATE_SERVICE,
            HEARTRATE_CHARACTERISTIC,
            app.onHEARTRATEChange,
            failure
        );

    },
    onHEARTRATEChange: function(buffer) {
        var data = new Uint16Array(buffer);
        var heartrate = data[0];
        // now remove flags byte by shifting right 8 bits
        heartrate = heartrate >>> 8; // unsigned bitwise right shift
        //var fahrenheit = (celsius * 1.8 + 32.0).toFixed(1);
        var message = "Heart rate is " + heartrate + " beats per minute.";
        statusDiv.innerHTML = message;
    },
    disconnect: function(e) {
        if (app.peripheral && app.peripheral.id) {
            ble.disconnect(app.peripheral.id, app.showMainPage, app.onError);
        }
    },
    showMainPage: function() {
        mainPage.hidden = false;
        detailPage.hidden = true;
    },
    showDetailPage: function() {
        mainPage.hidden = true;
        detailPage.hidden = false;
    },
    onBackButton: function() {
        if (mainPage.hidden) {
            app.disconnect();
        } else {
            navigator.app.exitApp();
        }
    },
    onError: function(reason) {
        navigator.notification.alert(reason, app.showMainPage, 'Error');
    }
};

app.initialize();
