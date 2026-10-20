# Problemas conocidos

Lo que sabemos que está mal y no alcanzamos a arreglar. Está ordenado por lo que más nos
dolió, no por severidad técnica.

Si encuentras algo que no está acá, agrégalo. Casi seguro hay más.


## D-03 · El módulo de evaluaciones no tiene tests

`src/evaluation/`

Cero. Lo hicimos en la última semana y no alcanzamos. Es el módulo que más baja la cobertura
del proyecto. Si vas a tocar rúbricas o scores, escribe los tests primero — nadie sabe qué se
rompe.


## D-05 · `calculateAccreditationStatus` sigue siendo compleja (pero ya hay red)

`src/placement/accreditation.ts`

ESLint sigue marcando la función por complejidad: ciclomática 17 (umbral 10) y
cognitiva 84 según SonarJS (umbral 15). `if` anidados hasta seis niveles con toda la
lógica de acreditación adentro.

Lo que cambió con E5-01: ya no se escribe a ciegas. La función tiene **tests de
caracterización que cubren el 100 %** de sus líneas y ramas, incluidas las razones
redundantes o contradictorias que acumula hoy. Cualquier refactor va a comparar contra
esa red: si un test rompe, el comportamiento cambió. Si querés refactorizar sin
cambiar resultados, empezá por mantener esa suite verde.

Reglas conocidas que la función aplica hoy están documentadas en el cuerpo del PR
de E5-01 (tabla entrada → resultado esperado).

