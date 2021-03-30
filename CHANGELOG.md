# 1.1.1 - 1.1.3
###### 30-03-2020
sap hana-client package update 2.7.26

# 1.1.0
###### 17-11-2020
[FEATURE] nieuwe methode queryBatch en static method insertBatch toegevoegd waarmee batches kunnen worden gedaan.

# 1.0.5
###### 13-11-2020
[FIX] Er kon zich een probleem voordoen met het geheugen van de DB.
Je kreeg dan een melding '{"error":"cannot allocate enough memory: Out of memory on query open"}'
Daarom his de Connection exec functie herschreven zodat het statement altijd gedropped wordt en dus het geheugen gecleared.

# 1.0.4
###### 14-07-2020
@sap/hana-client versie bijgewerkt naar de laatste versie 2.5.101

# 1.0.2-3
###### 29-06-2020
[FIX] Procedures aanroepen werkte niet, dat is nu verholpen
@sap/hana-client versie bijgewerkt naar de laatste versie 2.5.86
@sap/xsenv versie bijgewerkt naar de laatste versie 3.0.0"

# 1.0.1
###### 31-03-2020
@sap/hana-client versie bijgewerkt naar de laatste versie 2.4.182

# 1.0.0
###### 08-01-2020
Eerste versie beschikbaar als node package