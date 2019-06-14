/**
 * Xiaomi BLE 온습도계/ e잉크 시계 MQTT Sensor
 * @소스공개 : 그레고리하우스
 * @최종수정일 : 2019-06-14
 */

const noble = require('@abandonware/noble');
const mqtt = require('mqtt');
const util = require('util');

var uuids = [];

// 로그 표시
var log = (...args) => console.log('[' + new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}) + ']', args.join(' '));

const CONST = {
    LYWS: 'LYWSD02',
    MJHT: 'MJ_HT_V1',
    TEMP: 'temperature',
    HUMI: 'humidity',
    BOTH: 'both',
    BATT: 'battery'
};

const CONFIG = {
    
    // *************** 환경에 맞게 수정하세요! ***************
    // (둥근온습도계) deviceType: CONST.MJHT, sensorType: CONST.BOTH, CONST.BATT
    // (전자잉크시계) deviceType: CONST.LYWS, sensorType: CONST.TEMP, CONST.HUMI
    // 수정할 내용 : deviceId, macAddress
    // 동일 기기가 여러개일 경우에 deviceId를 다르게해서 추가
    DEVICES: [
        { deviceType: CONST.LYWS, deviceId: 'bedroom', macAddress: '00:00:00:00:00:00', sensorType: CONST.TEMP,  reverseMac: '', rawValue: '' },
        { deviceType: CONST.LYWS, deviceId: 'bedroom', macAddress: '00:00:00:00:00:00', sensorType: CONST.HUMI,  reverseMac: '', rawValue: '' },
        { deviceType: CONST.MJHT, deviceId: 'bathroom', macAddress: 'AA:AA:AA:AA:AA:AA', sensorType: CONST.BOTH,  reverseMac: '', rawValue: '', rawTempValue: '', rawHumiValue: '' },
        { deviceType: CONST.MJHT, deviceId: 'bathroom', macAddress: 'AA:AA:AA:AA:AA:AA', sensorType: CONST.BATT,  reverseMac: '', rawValue: '' }
        //,{ deviceType: CONST.MJHT, deviceId: 'room2', macAddress: 'FF:FF:FF:FF:FF:FF', sensorType: CONST.BOTH,  reverseMac: '', rawValue: '', rawTempValue: '', rawHumiValue: '' }
        //,{ deviceType: CONST.MJHT, deviceId: 'room2', macAddress: 'FF:FF:FF:FF:FF:FF', sensorType: CONST.BATT,  reverseMac: '', rawValue: '' }
    ],
    
    mqttBroker: 'mqtt://192.168.1.9', // *************** 환경에 맞게 수정하세요! ***************
    mqttUserName: 'username',         // *************** 환경에 맞게 수정하세요! ***************
    mqttPassword: 'password',         // *************** 환경에 맞게 수정하세요! ***************
    mqttTopic: 'xiaomible/%s/%s'

};

// MQTT-Broker 연결, username, password는 미사용시 삭제 가능
const client = mqtt.connect(CONFIG.mqttBroker, {clientId: 'Xiaomi-BLE', username: CONFIG.mqttUserName, password: CONFIG.mqttPassword});

// MQTT로 HA에 상태값 전송, (MQTT publish) xiaomible/${deviceId}/${sensorType} = ${value}
var updateStatus = (deviceId, sensorType, value) => {
    var topic = util.format(CONFIG.mqttTopic, deviceId, sensorType);
    client.publish(topic, value, {retain: true});
    log('[MQTT] Send to HA:', topic, '->', value);
}

noble.on('stateChange',  function(state) {
    if ( state != "poweredOn" ) return;
    CONFIG.DEVICES.forEach(function(d){
        uuids.push(d.macAddress.toLowerCase());
        d.reverseMac = d.macAddress.toString().toLowerCase().split(":").reverse().join("");
    });
    log("Starting scan...");
    uuids = Array.from(new Set(uuids));
    noble.startScanning([], true);
});

noble.on('discover', onDiscovery);
noble.on('scanStart', function() { log("Scanning started."); });
noble.on('scanStop', function() { log("Scanning stopped."); });

function onDiscovery(peripheral) {
    // check allowed devices
    if (uuids.indexOf(peripheral.address)<0) return;
    var serviceData = peripheral.advertisement.serviceData;
    if (serviceData && serviceData.length) {
        //log(peripheral.uuid + '/' + peripheral.advertisement.localName, '-', JSON.stringify(serviceData[0].data.toString('hex')));
        parseHexData( JSON.stringify(serviceData[0].data.toString('hex')).replace(/\"/gi, "") );
    }
}

function calculateSensorData(hexValue){
    const hexv = hexValue.substr(2).concat(hexValue.substr(0,2));
    const decv = parseInt(hexv, 16).toString();
    const flov = decv.substr(0,2).concat('.', decv.substr(2));
    return parseFloat(flov).toString();
}

function parseHexData(hexData){
    CONFIG.DEVICES.some(function(item, idx){
        if ( hexData.indexOf(item.reverseMac) > -1 ) {
            if ( CONST.LYWS == item.deviceType && hexData.length == 34 ) {
                const hexType = hexData.substr(24,2);
                const hexRawValue = hexData.substr(30);
                if ( CONST.TEMP == item.sensorType && "04" == hexType ) { //Temperature
                    if ( hexRawValue != item.rawValue ) {
                        const returnValue = calculateSensorData(hexRawValue);
                        //log(item.deviceId, item.deviceType, "temperature :", item.rawValue, '->', hexRawValue, '=', returnValue);
                        item.rawValue = hexRawValue;
                        updateStatus(item.deviceId, CONST.TEMP, returnValue);
                        return true;
                    }
                } else if ( CONST.HUMI == item.sensorType && "06" == hexType ) { //Humidity
                    if ( hexRawValue != item.rawValue ) {
                        const returnValue = calculateSensorData(hexRawValue);
                        //log(item.deviceId, item.deviceType, "humidity :", item.rawValue, '->', hexRawValue, '=', returnValue);
                        item.rawValue = hexRawValue;
                        updateStatus(item.deviceId, CONST.HUMI, returnValue);
                        return true;
                    }
                }
            } else if ( CONST.MJHT == item.deviceType && hexData.length >= 30 ) {
                const hexType = hexData.substr(22,2);
                if ( CONST.BATT == item.sensorType && "0a" == hexType && hexData.length == 30 ) { //Battery
                    const hexRawValue = hexData.substr(28);
                    if ( hexRawValue != item.rawValue ) {
                        const returnValue = parseInt(hexRawValue, 16).toString();
                        //log(item.deviceType, item.deviceId, "battery :", item.rawValue, '->', hexRawValue, '=', returnValue);
                        item.rawValue = hexRawValue;
                        updateStatus(item.deviceId, CONST.BATT, returnValue);
                        return true;
                    }
                } else if ( CONST.BOTH == item.sensorType && "0d" == hexType && hexData.length == 36 ) { //Temperature & Humidity
                    const hexRawValue = hexData.substr(28,8);
                    if ( hexRawValue != item.rawValue ) {
                        const hexTempRawValue = hexData.substr(28,4);
                        const hexHumiRawValue = hexData.substr(32,4);
                        item.rawValue = hexRawValue;
                        if ( hexTempRawValue != item.rawTempValue ) {
                            const returnTempValue = calculateSensorData(hexTempRawValue);
                            //log(item.deviceId, item.deviceType, "temperature :", item.rawTempValue, '->', hexTempRawValue, '=', returnTempValue);
                            item.rawTempValue = hexTempRawValue;
                            updateStatus(item.deviceId, CONST.TEMP, returnTempValue);
                        }
                        if ( hexHumiRawValue != item.rawHumiValue ) {
                            const returnHumiValue = calculateSensorData(hexHumiRawValue);
                            //log(item.deviceId, item.deviceType, "humidity :", item.rawHumiValue, '->', hexHumiRawValue, '=', returnHumiValue);
                            item.rawHumiValue = hexHumiRawValue;
                            updateStatus(item.deviceId, CONST.HUMI, returnHumiValue);
                        }
                        return true;
                    }
                }
            }
        }
    });
}
