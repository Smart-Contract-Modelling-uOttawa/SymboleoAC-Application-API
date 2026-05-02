# SymboleoAC API

**SymboleoAC API** is a secure and event-driven application layer that connects SymboleoAC smart contracts with external cyber-physical components, including IoT sensors, a message broker, a CEP engine, and Hyperledger Fabric.

It supports secure communication, event publication and subscription, smart contract transaction invocation, and role-based notifications.

## Installation

```bash
# node version v16.16.0
$ npm install
```


## Running the app

```bash

#  to enroll users and retrive IoT rules per case study (meatsale or vaccine procurementc)
$ go to EnrollRolesRetrieveIoTRules.js
$ uncomment parameters of intended case study 
$ then run below command
$ node EnrollRolesRetrieveIoTRules.js








#  to enroll and admin
$ go to app.js comment meatSale(): 298 , appRegisterAndEnrollUser(): 322 and uncomment appEnrollAdmin(): 321 then run below command

$ node app.js


#  to enroll and register buyer, seller

# go to app.js comment meatSale(): 298 , appEnrollAdmin(): 321 and uncomment appRegisterAndEnrollUser(): 322, change name of Org1UserId: 93 like buyer1, seller1, shipper1.

# `in CAUtil.js 
# for buyer
const attributes = `[{name: 'HF.role', value: 'party1_buyer', ecert:true}, {name: 'department', value: 'finance', ecert:true}]`;

# for seller
const attributes = `[{name: 'HF.role', value: 'party1_seller', ecert:true}, {name: 'department', value: 'finance', ecert:true}]`;

#then run below command

$ node app.js

# run the chaindoe 
$ comment appEnrollAdmin(), appRegisterAndEnrollUser() and uncomment meatSale() function then run below

$ node app.js
```