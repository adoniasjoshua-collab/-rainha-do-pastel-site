# Como atualizar o site da Rainha do Pastel

Você não precisa mexer em código. Basta pedir ao Claude, nesta pasta, com uma frase como as de baixo.

| O que você quer | Como pedir |
|---|---|
| Trocar um preço | "Muda a Coca lata para R$ 7." |
| Marcar como esgotado | "Marca o suco de uva como esgotado." |
| Voltar a vender | "O suco de uva voltou." |
| Adicionar item com foto | Mande a foto e diga: "Novo item: X-Burguer, pão, carne e queijo, R$ 18." |
| Adicionar espumante sem álcool | Mande a foto do rótulo (frente e verso) e o preço. |
| Mudar a taxa de entrega | "A entrega agora é R$ 8." |
| Mudar o horário | "Segunda a sexta, das 18h às 23h." |
| Trocar o WhatsApp | "Os pedidos agora vão para o número (94) 9XXXX-XXXX." |

Tudo fica em dois arquivos: `data/cardapio.json` (itens e preços) e `data/negocio.json` (telefone, taxa, horário).

Depois de qualquer mudança, o comando único que gera e confere o site é:

```
npm run gerar
```

Se algo estiver errado, como um item sem preço, ele avisa e não gera o site. Nada vai para o ar sem a sua aprovação.
